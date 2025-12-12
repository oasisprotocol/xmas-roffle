// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

/// @title IRoffle - Interface for the Oasis Christmas Raffle
/// @author Oasis Protocol Foundation
/// @notice Defines events, errors, and data structures for the Roffle contract
interface IRoffle {
    /// @notice Enum representing the current state of the raffle
    enum RaffleState {
        Active,
        Ended,
        Completed
    }

    /// @notice Structure to store winner information
    struct Winner {
        address winner;
        uint256 prize;
    }

    /// @notice Emitted when tickets are purchased
    /// @param buyer Address of the ticket buyer
    /// @param quantity Number of tickets purchased
    /// @param totalCost Total ROSE spent
    event TicketsPurchased(
        address indexed buyer,
        uint256 quantity,
        uint256 totalCost
    );

    /// @notice Emitted when OPF adds contribution to the prize pool
    /// @param amount Amount of ROSE contributed
    event OPFContributionAdded(uint256 amount);

    /// @notice Emitted when OPF contribution is withdrawn (emergency only)
    /// @param amount Amount withdrawn
    event OPFContributionWithdrawn(uint256 amount);

    /// @notice Emitted when ticket sales are closed early
    /// @param closedAt Timestamp when sales were closed
    event SalesClosed(uint256 closedAt);

    /// @notice Emitted when winners are selected and prizes distributed
    /// @param winners Array of winner addresses
    /// @param prizes Array of prize amounts
    event WinnersSelected(address[3] winners, uint256[3] prizes);

    /// @notice Emitted when a prize is distributed to a winner
    /// @param winner Address of the winner
    /// @param prize Amount of ROSE won
    /// @param rank Winner's rank (1-10)
    event PrizeDistributed(address indexed winner, uint256 prize, uint256 rank);

    /// @notice Emitted when a refund is issued
    /// @param buyer Address receiving the refund
    /// @param amount Amount refunded
    event RefundIssued(address indexed buyer, uint256 amount);

    /// @notice Thrown when attempting to purchase zero tickets
    error ZeroTickets();

    /// @notice Thrown when payment amount doesn't match ticket cost
    /// @param sent Amount sent
    /// @param required Amount required
    error IncorrectPayment(uint256 sent, uint256 required);

    /// @notice Thrown when purchase would exceed per-wallet limit
    /// @param requested Tickets requested
    /// @param allowed Tickets still allowed for this wallet
    error ExceedsWalletLimit(uint256 requested, uint256 allowed);

    /// @notice Thrown when purchase would exceed total ticket supply
    /// @param requested Tickets requested
    /// @param available Tickets still available
    error ExceedsTotalSupply(uint256 requested, uint256 available);

    /// @notice Thrown when raffle has already ended
    error RaffleEnded();

    /// @notice Thrown when raffle is still active
    error RaffleStillActive();

    /// @notice Thrown when raffle is already completed
    error RaffleAlreadyCompleted();

    /// @notice Thrown when not enough tickets sold for a valid raffle
    error NotEnoughParticipants();

    /// @notice Thrown when prize transfer fails
    /// @param winner Address of the winner
    /// @param amount Amount that failed to transfer
    error PrizeTransferFailed(address winner, uint256 amount);

    /// @notice Thrown when refund transfer fails
    /// @param buyer Address of the buyer
    /// @param amount Amount that failed to transfer
    error RefundTransferFailed(address buyer, uint256 amount);

    /// @notice Thrown when trying to add zero OPF contribution
    error ZeroContribution();

    /// @notice Thrown when OPF withdrawal fails
    error WithdrawalFailed();

    /// @notice Thrown when raffle end time is in the past
    /// @param provided Provided end time
    /// @param current Current block timestamp
    error EndTimeInPast(uint256 provided, uint256 current);

    /// @notice Thrown when new end time is after current end time (can only close early)
    error CanOnlyCloseEarly();

    /// @notice Purchase raffle tickets
    /// @param quantity Number of tickets to purchase
    function buyTickets(uint256 quantity) external payable;

    /// @notice Add OPF contribution to the prize pool
    function addOPFContribution() external payable;

    /// @notice Withdraw OPF contribution (emergency only, before raffle ends)
    function withdrawOPFContribution() external;

    /// @notice Close ticket sales early (before the scheduled end time)
    function closeSalesEarly() external;

    /// @notice Select winners and distribute prizes
    function selectWinnersAndDistribute() external;

    /// @notice Cancel the raffle and refund all participants (emergency only)
    function cancelAndRefund() external;

    /// @notice Get the total prize pool
    /// @return Total ROSE available for prizes
    function getTotalPrizePool() external view returns (uint256);

    /// @notice Get the number of tickets remaining for sale
    /// @return Number of tickets still available
    function getTicketsRemaining() external view returns (uint256);

    /// @notice Get the number of tickets a wallet can still purchase
    /// @param wallet Address to check
    /// @return Number of tickets the wallet can still buy
    function getTicketsAllowedForWallet(address wallet) external view returns (uint256);

    /// @notice Check if the raffle is currently active (accepting ticket purchases)
    /// @return True if tickets can still be purchased
    function isActive() external view returns (bool);

    /// @notice Get time remaining until raffle ends
    /// @return Seconds until raffle ends, 0 if already ended
    function getTimeRemaining() external view returns (uint256);

    /// @notice Get all winner information after raffle completion
    /// @return Array of Winner structs containing addresses and prizes
    function getWinners() external view returns (Winner[3] memory);

    /// @notice Get the total number of entries (for transparency)
    /// @return Total number of ticket entries
    function getTotalEntries() external view returns (uint256);

    /// @notice Get prize amount for a specific rank
    /// @param rank Winner rank (0-9, where 0 is first place)
    /// @return Prize amount in ROSE for that rank
    function getPrizeForRank(uint256 rank) external view returns (uint256);
}
