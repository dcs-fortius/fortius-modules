// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Enum} from "./Enum.sol";

interface GnosisSafe {
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation
    ) external returns (bool success);

    function isOwner(address owner) external view returns (bool);

    function getThreshold() external view returns (uint256);
}

contract FortiusModule {
    string public constant NAME = "Permission Module";
    string public constant VERSION = "0.1.1";
    enum Role {
        None,
        Trader,
        Approver,
        Owner
    }
    enum TxStatus {
        None,
        Proposed,
        Approved,
        Executed,
        Cancelled
    }

    struct Transaction {
        address proposer;
        address token;
        address[] recipients;
        uint256[] values;
        uint256 timestamp;
        bool cancellable;
        bytes32 salt;
        TxStatus status;
        uint256 approvals;
    }

    struct Allowance {
        uint96 amount;
        uint96 spent;
        uint32 lastResetMin;
        uint16 resetTimeMin;
    }

    mapping(address => mapping(address => Role)) public roles; // safe => address => Role
    mapping(address => mapping(bytes32 => Transaction)) public transactions; // safe => txHash => Transaction
    mapping(address => mapping(address => mapping(address => Allowance)))
        public allowances; // safe => allowanceOwner => token => Allowance

    event TransactionProposed(
        address indexed safe,
        bytes32 indexed txHash,
        address indexed proposer
    );
    event TransactionApproved(
        address indexed safe,
        bytes32 indexed txHash,
        address indexed approver,
        uint256 approvals
    );
    event TransactionExecuted(
        address indexed safe,
        bytes32 indexed txHash,
        address executor
    );
    event TransactionCancelled(address indexed safe, bytes32 indexed txHash);

    event SetAllowance(
        address indexed safe,
        address indexed allowanceOwner,
        address indexed token,
        uint96 allowanceAmount,
        uint16 resetTimeMin
    );

    event ResetAllowance(
        address indexed safe,
        address allowanceOwner,
        address token
    );

    event DeleteAllowance(
        address indexed safe,
        address allowanceOwner,
        address token
    );

    receive() external payable {}

    modifier onlyTrader(address safe) {
        require(
            GnosisSafe(safe).isOwner(msg.sender) ||
                roles[safe][msg.sender] == Role.Trader,
            "Not authorized: Only Owner or Trader"
        );
        _;
    }

    modifier onlyApprover(address safe) {
        require(
            GnosisSafe(safe).isOwner(msg.sender) ||
                roles[safe][msg.sender] == Role.Approver,
            "Not authorized: Only Owner or Approver"
        );
        _;
    }

    modifier onlyOwner(address safe) {
        require(
            GnosisSafe(safe).isOwner(msg.sender),
            "Not authorized: Only Owner"
        );
        _;
    }

    function propose(
        address safe,
        address token,
        address[] calldata recipients,
        uint256[] calldata values,
        uint256 timestamp,
        bool cancellable,
        bytes32 salt
    ) public onlyTrader(safe) returns (bytes32) {
        require(
            recipients.length == values.length,
            "Recipients and values length mismatch"
        );
        bytes32 id = hashOperation(
            safe,
            token,
            recipients,
            values,
            timestamp,
            cancellable,
            salt
        );
        require(
            transactions[safe][id].status == TxStatus.None,
            "Transaction already exists"
        );

        Allowance memory proposerAllowance = allowances[safe][msg.sender][
            token
        ];

        uint96 totalValue = 0;
        for (uint256 i = 0; i < values.length; i++) {
            totalValue += uint96(values[i]);
        }
        uint96 newSpent = proposerAllowance.spent + totalValue;

        require(
            newSpent <= proposerAllowance.amount - proposerAllowance.spent,
            "Proposer allowance exceeded or newSpent <= proposerAllowance.amount"
        );
        proposerAllowance.spent = newSpent;
        updateAllowance(safe, msg.sender, token, proposerAllowance);

        transactions[safe][id] = Transaction({
            proposer: msg.sender,
            token: token,
            recipients: recipients,
            values: values,
            timestamp: timestamp,
            cancellable: cancellable,
            salt: salt,
            status: TxStatus.Proposed,
            approvals: 0
        });

        emit TransactionProposed(safe, id, msg.sender);
        return id;
    }

    function approve(address safe, bytes32 id) public onlyApprover(safe) {
        Transaction storage txn = transactions[safe][id];
        require(
            txn.status == TxStatus.Proposed,
            "Transaction not proposed or already approved"
        );

        txn.approvals += 1;
        emit TransactionApproved(safe, id, msg.sender, txn.approvals);

        if (txn.approvals >= GnosisSafe(safe).getThreshold()) {
            txn.status = TxStatus.Approved;
        }
    }

    function execute(address safe, bytes32 id) public onlyOwner(safe) {
        Transaction storage txn = transactions[safe][id];
        require(txn.status == TxStatus.Approved, "Transaction not approved");
        require(txn.status != TxStatus.Executed, "Item executed");
        require(txn.status != TxStatus.Cancelled, "Item canceled");
        require(
            txn.approvals >= GnosisSafe(safe).getThreshold(),
            "Insufficient approvals"
        );

        txn.status = TxStatus.Executed;
        emit TransactionExecuted(safe, id, msg.sender);

        _escrow(GnosisSafe(safe), txn.token, txn.values);

        if (txn.token == address(0)) {
            for (uint256 i = 0; i < txn.recipients.length; i++)
                payable(txn.recipients[i]).transfer(txn.values[i]);
        } else {
            IERC20 token = IERC20(txn.token);
            for (uint256 i = 0; i < txn.recipients.length; i++)
                require(token.transfer(txn.recipients[i], txn.values[i]));
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

    function cancel(bytes32 id) public {
        Transaction storage txn = transactions[msg.sender][id];
        require(txn.status != TxStatus.Executed, "Item already executed");
        require(txn.status != TxStatus.Cancelled, "Item already canceled");
        require(txn.cancellable, "Item not cancellable");

        txn.status = TxStatus.Cancelled;

        Allowance memory proposerAllowance = allowances[msg.sender][
            txn.proposer
        ][txn.token];

        uint96 totalValue = 0;
        for (uint256 i = 0; i < txn.values.length; i++) {
            totalValue += uint96(txn.values[i]);
        }
        proposerAllowance.spent = proposerAllowance.spent - totalValue;
        updateAllowance(msg.sender, txn.proposer, txn.token, proposerAllowance);
        emit TransactionCancelled(msg.sender, id);
    }

    //geter, setter, checker

    function hashOperation(
        address safe,
        address token,
        address[] calldata recipients,
        uint256[] calldata values,
        uint256 timestamp,
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
                    cancellable,
                    salt
                )
            );
    }

    function setRole(address user, Role role) public {
        roles[msg.sender][user] = role;
    }

    function isTrader(address safe, address user) public view returns (bool) {
        return roles[safe][user] == Role.Trader;
    }

    function isApprover(address safe, address user) public view returns (bool) {
        return roles[safe][user] == Role.Approver;
    }

    function isOwner(address safe, address user) public view returns (bool) {
        return GnosisSafe(safe).isOwner(user);
    }

    function isTransactionApproved(
        address safe,
        bytes32 txHash
    ) public view returns (bool) {
        return
            transactions[safe][txHash].approvals >=
            GnosisSafe(safe).getThreshold();
    }

    //for limit

    function getAllowance(
        address safe,
        address allowanceOwner,
        address token
    ) private view returns (Allowance memory allowance) {
        allowance = allowances[safe][allowanceOwner][token];
        uint32 currentMin = uint32(block.timestamp / 60);
        if (
            allowance.resetTimeMin > 0 &&
            allowance.lastResetMin <= currentMin - allowance.resetTimeMin
        ) {
            allowance.spent = 0;
            // Resets happen in regular intervals and `lastResetMin` should be aligned to that
            allowance.lastResetMin =
                currentMin -
                ((currentMin - allowance.lastResetMin) %
                    allowance.resetTimeMin);
        }
        return allowance;
    }

    function setAllowance(
        address allowanceOwner,
        address token,
        uint96 allowanceAmount,
        uint16 resetTimeMin
    ) public {
        require(token != address(0), "Token address cannot be zero");

        Allowance memory allowance = allowances[msg.sender][allowanceOwner][
            token
        ];
        uint32 currentMin = uint32(block.timestamp / 60);

        if (allowance.lastResetMin == 0) {
            allowance.lastResetMin = currentMin;
        }

        allowance.resetTimeMin = resetTimeMin;
        allowance.amount = allowanceAmount;
        updateAllowance(msg.sender, allowanceOwner, token, allowance);
        emit SetAllowance(
            msg.sender,
            allowanceOwner,
            token,
            allowanceAmount,
            resetTimeMin
        );
    }

    function resetAllowance(address allowanceOwner, address token) public {
        Allowance memory allowance = allowances[msg.sender][allowanceOwner][
            token
        ];
        allowance.spent = 0;
        updateAllowance(msg.sender, allowanceOwner, token, allowance);
        emit ResetAllowance(msg.sender, allowanceOwner, token);
    }

    function deleteAllowance(address allowanceOwner, address token) public {
        Allowance memory allowance = allowances[msg.sender][allowanceOwner][
            token
        ];
        allowance.amount = 0;
        allowance.spent = 0;
        allowance.resetTimeMin = 0;
        allowance.lastResetMin = 0;
        updateAllowance(msg.sender, allowanceOwner, token, allowance);
        emit DeleteAllowance(msg.sender, allowanceOwner, token);
    }

    function updateAllowance(
        address safe,
        address allowanceOwner,
        address token,
        Allowance memory allowance
    ) private {
        allowances[safe][allowanceOwner][token] = allowance;
    }
}
