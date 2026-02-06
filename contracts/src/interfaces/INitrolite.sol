// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IChannel - Nitrolite state channel interface
/// @notice Interface for Yellow Network state channel operations
interface IChannel {
    /// @notice Channel status enum
    enum ChannelStatus {
        None,
        Open,
        Funded,
        Closing,
        Closed
    }

    /// @notice Create a new state channel
    /// @param channelId Unique channel identifier
    /// @param participants Array of participant addresses
    /// @param allocations Initial allocation amounts for each participant
    function createChannel(
        bytes32 channelId,
        address[] calldata participants,
        uint256[] calldata allocations
    ) external;

    /// @notice Close a channel cooperatively with final state
    /// @param channelId Channel to close
    /// @param finalState Encoded final state
    /// @param signatures Signatures from all participants
    function closeChannel(
        bytes32 channelId,
        bytes calldata finalState,
        bytes[] calldata signatures
    ) external;

    /// @notice Challenge a channel with a signed state
    /// @param channelId Channel to challenge
    /// @param state Encoded state to submit
    /// @param signature Signature for the state
    function challenge(
        bytes32 channelId,
        bytes calldata state,
        bytes calldata signature
    ) external;

    /// @notice Get channel status
    /// @param channelId Channel to query
    /// @return status Current channel status
    function getChannelStatus(bytes32 channelId) external view returns (ChannelStatus status);

    /// @notice Get channel participants
    /// @param channelId Channel to query
    /// @return participants Array of participant addresses
    function getChannelParticipants(bytes32 channelId) external view returns (address[] memory participants);
}

/// @title IDeposit - Nitrolite deposit/custody interface
/// @notice Interface for Yellow Network custody contract operations
interface IDeposit {
    /// @notice Deposit tokens into custody
    /// @param token Token address to deposit
    /// @param amount Amount to deposit
    function deposit(address token, uint256 amount) external;

    /// @notice Withdraw tokens from custody
    /// @param token Token address to withdraw
    /// @param amount Amount to withdraw
    function withdraw(address token, uint256 amount) external;

    /// @notice Get account balance in custody
    /// @param account Account to query
    /// @param token Token address
    /// @return balance Current balance
    function getBalance(address account, address token) external view returns (uint256 balance);

    /// @notice Get balances for multiple accounts and tokens
    /// @param accounts Array of account addresses
    /// @param tokens Array of token addresses
    /// @return balances Array of balances
    function getAccountsBalances(
        address[] calldata accounts,
        address[] calldata tokens
    ) external view returns (uint256[] memory balances);
}

/// @title IAdjudicator - Nitrolite adjudicator interface
/// @notice Interface for state validation and dispute resolution
interface IAdjudicator {
    /// @notice Validate a state transition
    /// @param channelId Channel identifier
    /// @param oldState Previous state
    /// @param newState New state to validate
    /// @param signatures Signatures approving the transition
    /// @return valid Whether the transition is valid
    function validateTransition(
        bytes32 channelId,
        bytes calldata oldState,
        bytes calldata newState,
        bytes[] calldata signatures
    ) external view returns (bool valid);

    /// @notice Get the challenge duration for a channel
    /// @param channelId Channel to query
    /// @return duration Challenge duration in seconds
    function getChallengeDuration(bytes32 channelId) external view returns (uint256 duration);
}
