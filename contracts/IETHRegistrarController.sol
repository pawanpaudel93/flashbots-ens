// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

interface IPriceOracle {
    struct Price {
        uint256 base;
        uint256 premium;
    }

    /**
     * @dev Returns the price to register or renew a name.
     * @param name The name being registered or renewed.
     * @param expires When the name presently expires (0 if this is a new registration).
     * @param duration How long the name is being registered or extended for, in seconds.
     * @return base premium tuple of base price + premium price
     */
    function price(
        string calldata name,
        uint256 expires,
        uint256 duration
    ) external view returns (uint256);
}

interface IETHRegistrarController {
    function minCommitmentAge() external view returns (uint256);

    function rentPrice(string memory name, uint256 duration) external view returns (uint256);

    function available(string memory name) external view returns (bool);

    function makeCommitment(
        string memory name,
        address owner,
        bytes32 secret
    ) external pure returns (bytes32);

    function makeCommitmentWithConfig(
        string memory name,
        address owner,
        bytes32 secret,
        address resolver,
        address addr
    ) external pure returns (bytes32);

    function commit(bytes32 commitment) external;

    function register(
        string calldata name,
        address owner,
        uint256 duration,
        bytes32 secret
    ) external payable;

    function registerWithConfig(
        string memory name,
        address owner,
        uint256 duration,
        bytes32 secret,
        address resolver,
        address addr
    ) external payable;

    function renew(string calldata name, uint256 duration) external payable;
}
