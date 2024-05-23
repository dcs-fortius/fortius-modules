// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

import {Enum} from "./Enum.sol";

interface GnosisSafe {
    function nonce() external returns (uint256);

    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation
    ) external returns (bool success);

    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures
    ) external payable returns (bool success);

    function approveHash(bytes32 hashToApprove) external;

    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 _nonce
    ) external returns (bytes32);

    function enableModule(address module) external;
}

interface IProxyCreationCallback {
    function proxyCreated(
        GnosisSafe proxy,
        address _singleton,
        bytes calldata initializer,
        uint256 saltNonce
    ) external;
}

contract FortiusCallback is IProxyCreationCallback {
    function aproveAndExecute(
        GnosisSafe proxy,
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver
    ) internal {
        require(
            proxy.execTransaction(
                to,
                value,
                data,
                operation,
                safeTxGas,
                baseGas,
                gasPrice,
                gasToken,
                refundReceiver,
                abi.encode(
                    bytes32(uint256(uint160(address(this)))),
                    bytes32(0),
                    bytes1(uint8(1))
                )
            ),
            "execTransaction error"
        );
    }

    function proxyCreated(
        GnosisSafe proxy,
        address /* _singleton */,
        bytes calldata /* initializer */,
        uint256 /* saltNonce */
    ) external {
        aproveAndExecute(
            proxy,
            address(proxy),
            0,
            abi.encodeWithSignature("enableModule(address)", address(this)),
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            payable(0)
        );
    }
}
