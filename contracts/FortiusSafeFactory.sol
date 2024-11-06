// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {Enum} from "./Enum.sol";

interface GnosisSafe {
    function setup(
        address[] calldata _owners,
        uint256 _threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;

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
}

interface GnosisSafeProxyFactory {
    function createProxyWithNonce(
        address _singleton,
        bytes memory initializer,
        uint256 saltNonce
    ) external returns (GnosisSafe proxy);
}

contract FortiusSafeFactory {
    GnosisSafeProxyFactory public safeFactory;
    address public singleton;
    mapping(address => string) public name;

    constructor(address _safeFactory, address _singleton) {
        require(_safeFactory != address(0), "Invalid factory address provided");
        require(_singleton != address(0), "Invalid singleton address provided");
        safeFactory = GnosisSafeProxyFactory(_safeFactory);
        singleton = _singleton;
    }

    function deploy(
        string calldata _name,
        address[] calldata _owners,
        uint256 _threshold,
        uint256 saltNonce,
        address[] calldata _modules
    ) external returns (GnosisSafe proxy) {
        address[] memory tempOwners = new address[](_owners.length + 1);
        for (uint i = 0; i < _owners.length; i++) {
            tempOwners[i] = _owners[i];
        }
        tempOwners[_owners.length] = address(this);

        bytes memory initializer = abi.encodeWithSelector(
            GnosisSafe.setup.selector,
            tempOwners,
            1,
            address(0),
            "",
            address(0),
            address(0),
            0,
            payable(0)
        );
        proxy = safeFactory.createProxyWithNonce(
            singleton,
            initializer,
            saltNonce
        );
        for (uint i = 0; i < _modules.length; i++) {
            require(
                _execute(
                    proxy,
                    abi.encodeWithSignature(
                        "enableModule(address)",
                        _modules[i]
                    )
                ),
                "Enable module error"
            );
        }
        require(
            _execute(
                proxy,
                abi.encodeWithSignature(
                    "removeOwner(address,address,uint256)",
                    _owners[_owners.length - 1],
                    address(this),
                    _threshold
                )
            ),
            "Update owner error"
        );
        name[address(proxy)] = _name;
    }

    function _execute(
        GnosisSafe proxy,
        bytes memory data
    ) internal returns (bool success) {
        return
            proxy.execTransaction(
                address(proxy),
                0,
                data,
                Enum.Operation.Call,
                0,
                0,
                0,
                address(0),
                payable(0),
                abi.encode(
                    bytes32(uint256(uint160(address(this)))),
                    bytes32(0),
                    bytes1(uint8(1))
                )
            );
    }
}
