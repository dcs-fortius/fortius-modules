// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

import {Enum} from "./Enum.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface GnosisSafe {
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation
    ) external returns (bool success);
}

contract TimelockModule {
    string public constant NAME = "Timelock Module";
    string public constant VERSION = "0.1.0";

    struct Scheduled {
        address token;
        address[] recipients;
        uint256[] values;
        uint256 timestamp;
        bool escrow;
        bool cancellable;
        bool executed;
        bool canceled;
    }

    mapping(address => mapping(bytes32 => Scheduled)) private _scheduled;

    function hashOperation(
        address safe,
        address token,
        address[] calldata recipients,
        uint256[] calldata values,
        uint256 timestamp,
        bool escrow,
        bool cancellable,
        bytes32 salt
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    safe,
                    token,
                    recipients,
                    values,
                    timestamp,
                    escrow,
                    cancellable,
                    salt
                )
            );
    }

    function schedule(
        address token,
        address[] calldata recipients,
        uint256[] calldata values,
        uint256 timestamp,
        bool escrow,
        bool cancellable,
        bytes32 salt
    ) public {
        bytes32 id = hashOperation(
            msg.sender,
            token,
            recipients,
            values,
            timestamp,
            escrow,
            cancellable,
            salt
        );
        if (escrow) {
            _escrow(GnosisSafe(msg.sender), token, values);
        }
        _scheduled[msg.sender][id] = Scheduled(
            token,
            recipients,
            values,
            timestamp,
            escrow,
            cancellable,
            false,
            false
        );
    }

    function execute(address safe, bytes32 id) public {
        Scheduled storage item = _scheduled[safe][id];
        if (!item.escrow) {
            _escrow(GnosisSafe(safe), item.token, item.values);
        }
        if (item.token == address(0)) {
            for (uint256 i = 0; i < item.recipients.length; i++)
                payable(item.recipients[i]).transfer(item.values[i]);
        } else {
            IERC20 token = IERC20(item.token);
            for (uint256 i = 0; i < item.recipients.length; i++)
                require(token.transfer(item.recipients[i], item.values[i]));
        }
        item.executed = true;
    }

    function cancel(bytes32 id) public {
        Scheduled storage item = _scheduled[msg.sender][id];
        item.canceled = true;
    }

    function _escrow(
        GnosisSafe safe,
        address token,
        uint256[] memory values
    ) internal {
        uint256 amount = 0;
        for (uint256 i = 0; i < values.length; i++) {
            amount += values[i];
        }
        if (token == address(0)) {
            uint256 oldBalance = address(this).balance;
            require(
                safe.execTransactionFromModule(
                    address(this),
                    amount,
                    "",
                    Enum.Operation.Call
                ),
                "Could not execute ether transfer"
            );
            uint256 newBalance = address(this).balance;
            require(newBalance == oldBalance + amount);
        } else {
            uint256 oldBalance = IERC20(token).balanceOf(address(this));
            bytes memory data = abi.encodeWithSignature(
                "transfer(address,uint256)",
                address(this),
                amount
            );
            require(
                safe.execTransactionFromModule(
                    token,
                    0,
                    data,
                    Enum.Operation.Call
                ),
                "Could not execute token transfer"
            );
            uint256 newBalance = IERC20(token).balanceOf(address(this));
            require(newBalance == oldBalance + amount);
        }
    }
}
