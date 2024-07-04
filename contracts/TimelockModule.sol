// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Enum} from "./Enum.sol";

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
    string public constant VERSION = "0.1.1";

    event TransferScheduled(
        bytes32 indexed id,
        address indexed safe,
        uint256 timestamp
    );
    event TransferExecuted(bytes32 indexed id, address indexed safe);
    event TransferCancelled(bytes32 indexed id, address indexed safe);

    struct TransferItem {
        address token;
        address[] recipients;
        uint256[] values;
        uint256 timestamp;
        bool escrow;
        bool cancellable;
        bool executed;
        bool canceled;
    }

    mapping(address => mapping(bytes32 => TransferItem)) private _scheduled;

    receive() external payable {}

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
        require(timestamp > block.timestamp, "Invalid timestamp");
        require(recipients.length == values.length, "Length mismatch");
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
        require(_scheduled[msg.sender][id].timestamp == 0, "Item existed");
        emit TransferScheduled(id, msg.sender, timestamp);
        if (escrow) {
            _escrow(GnosisSafe(msg.sender), token, values);
        }
        _scheduled[msg.sender][id] = TransferItem(
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
        TransferItem storage item = _scheduled[safe][id];
        require(item.timestamp > 0, "Item not found");
        require(!item.executed, "Item executed");
        require(!item.canceled, "Item canceled");
        require(item.timestamp <= block.timestamp, "Too early");
        emit TransferExecuted(id, msg.sender);
        item.executed = true;
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
    }

    function cancel(bytes32 id) public {
        TransferItem storage item = _scheduled[msg.sender][id];
        require(item.timestamp > 0, "Item not found");
        require(!item.executed, "Item executed");
        require(!item.canceled, "Item canceled");
        require(item.cancellable, "Item not cancellable");
        emit TransferCancelled(id, msg.sender);
        item.canceled = true;
        if (item.escrow) {
            uint256 amount = 0;
            for (uint256 i = 0; i < item.values.length; i++) {
                amount += item.values[i];
            }
            if (item.token == address(0)) {
                payable(msg.sender).transfer(amount);
            } else {
                require(IERC20(item.token).transfer(msg.sender, amount));
            }
        }
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
