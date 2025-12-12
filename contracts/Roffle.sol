// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IRoffle} from "./interfaces/IRoffle.sol";

/// @title Roffle - Oasis Christmas Raffle 2025
/// @author Oasis Protocol Foundation
/// @notice A fair, on-chain raffle powered by Sapphire's secure randomness
/// @dev Uses Sapphire's hardware-backed randomness for winner selection
contract Roffle is IRoffle, ReentrancyGuard, Ownable {
    // ============================================================
    //                          CONSTANTS
    // ============================================================

    /// @notice Cost of a single ticket in ROSE (250 ROSE)
    uint256 public constant TICKET_PRICE = 1 ether;

    /// @notice Maximum tickets a single wallet can purchase
    uint256 public constant MAX_TICKETS_PER_WALLET = 10;

    /// @notice Maximum total tickets available for sale
    uint256 public constant MAX_TOTAL_TICKETS = 15;

    /// @notice Number of winners to be selected
    uint256 public constant WINNER_COUNT = 3;

    /// @notice Default raffle duration (1 week)
    uint256 public constant DEFAULT_DURATION = 1 hours;

    /// @notice Basis points denominator (100% = 10000)
    uint256 public constant BASIS_POINTS = 10000;

    /// @notice Prize distribution percentages in basis points (100 = 1%)
    /// @dev [50%, 20%, 10%, 5%, 5%, 2%, 2%, 2%, 2%, 2%]
    uint256[WINNER_COUNT] public PRIZE_PERCENTAGES = [
        uint256(5000), 3000, 2000
    ];

    // ============================================================
    //                       STATE VARIABLES
    // ============================================================

    /// @notice Timestamp when ticket sales end
    uint256 public raffleEndTime;

    /// @notice Total number of tickets sold
    uint256 public ticketsSold;

    /// @notice Additional contribution from OPF to the prize pool
    uint256 public opfContribution;

    /// @notice Current state of the raffle
    RaffleState public state;

    /// @notice Array of all ticket entries (one address per ticket purchased)
    address[] private _entries;

    /// @notice Mapping of wallet address to number of tickets purchased
    mapping(address => uint256) public ticketsPurchased;

    /// @notice Array of winners after the raffle is completed
    Winner[WINNER_COUNT] public winners;

    // ============================================================
    //                        CONSTRUCTOR
    // ============================================================

    /// @notice Creates a new Roffle contract
    /// @param _endTime Unix timestamp when ticket sales end (0 for default 1 week duration)
    constructor(uint256 _endTime) Ownable(msg.sender) {
        if (_endTime == 0) {
            raffleEndTime = block.timestamp + DEFAULT_DURATION;
        } else {
            if (_endTime <= block.timestamp) {
                revert EndTimeInPast(_endTime, block.timestamp);
            }
            raffleEndTime = _endTime;
        }
        state = RaffleState.Active;
    }

    // ============================================================
    //                    EXTERNAL FUNCTIONS
    // ============================================================

    /// @notice Purchase raffle tickets
    /// @param quantity Number of tickets to purchase
    /// @dev Requires exact payment of TICKET_PRICE * quantity
    function buyTickets(uint256 quantity) external payable nonReentrant {
        _validatePurchase(quantity);

        ticketsPurchased[msg.sender] += quantity;
        ticketsSold += quantity;

        for (uint256 i = 0; i < quantity; i++) {
            _entries.push(msg.sender);
        }

        emit TicketsPurchased(msg.sender, quantity, msg.value);
    }

    // ============================================================
    //                 EXTERNAL FUNCTIONS (ADMIN)
    // ============================================================

    /// @notice Add OPF contribution to the prize pool
    /// @dev Can only be called by the owner while raffle is active
    function addOPFContribution() external payable onlyOwner {
        if (state != RaffleState.Active) revert RaffleAlreadyCompleted();
        if (msg.value == 0) revert ZeroContribution();
        opfContribution += msg.value;
        emit OPFContributionAdded(msg.value);
    }

    /// @notice Withdraw OPF contribution (emergency only, before raffle ends)
    /// @dev Can only be called by owner while raffle is still active
    function withdrawOPFContribution() external onlyOwner nonReentrant {
        if (state != RaffleState.Active) revert RaffleAlreadyCompleted();
        uint256 amount = opfContribution;
        if (amount == 0) revert ZeroContribution();

        opfContribution = 0;
        _transferFunds(owner(), amount, true);
        emit OPFContributionWithdrawn(amount);
    }

    /// @notice Close ticket sales early (before the scheduled end time)
    /// @dev Can only close early, cannot extend the raffle
    function closeSalesEarly() external onlyOwner {
        if (state != RaffleState.Active) revert RaffleAlreadyCompleted();
        if (block.timestamp >= raffleEndTime) revert RaffleEnded();

        raffleEndTime = block.timestamp;
        state = RaffleState.Ended;
        emit SalesClosed(block.timestamp);
    }

    /// @notice Select winners and distribute prizes
    /// @dev Uses Sapphire's secure randomness, can only be called once after raffle ends
    function selectWinnersAndDistribute() external onlyOwner nonReentrant {
        _validateDrawConditions();
        state = RaffleState.Completed;

        uint256 totalPrizePool = address(this).balance;
        (address[WINNER_COUNT] memory winnerAddresses, uint256[WINNER_COUNT] memory prizeAmounts) = _selectWinners(totalPrizePool);

        emit WinnersSelected(winnerAddresses, prizeAmounts);
        _distributePrizes();
    }

    /// @notice Cancel the raffle and refund all participants (emergency only)
    /// @dev Can only be called by owner before winners are selected
    function cancelAndRefund() external onlyOwner nonReentrant {
        if (state == RaffleState.Completed) revert RaffleAlreadyCompleted();
        state = RaffleState.Completed;

        _refundOPFContribution();
        _refundAllBuyers();
    }

    // ============================================================
    //                   EXTERNAL VIEW FUNCTIONS
    // ============================================================

    /// @notice Get the total prize pool
    /// @return Total ROSE available for prizes
    function getTotalPrizePool() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Get the number of tickets remaining for sale
    /// @return Number of tickets still available
    function getTicketsRemaining() external view returns (uint256) {
        return MAX_TOTAL_TICKETS - ticketsSold;
    }

    /// @notice Get the number of tickets a wallet can still purchase
    /// @param wallet Address to check
    /// @return Number of tickets the wallet can still buy
    function getTicketsAllowedForWallet(address wallet) external view returns (uint256) {
        uint256 purchased = ticketsPurchased[wallet];
        if (purchased >= MAX_TICKETS_PER_WALLET) return 0;
        return MAX_TICKETS_PER_WALLET - purchased;
    }

    /// @notice Check if the raffle is currently active (accepting ticket purchases)
    /// @return True if tickets can still be purchased
    function isActive() external view returns (bool) {
        return state == RaffleState.Active && block.timestamp < raffleEndTime;
    }

    /// @notice Get time remaining until raffle ends
    /// @return Seconds until raffle ends, 0 if already ended
    function getTimeRemaining() external view returns (uint256) {
        if (block.timestamp >= raffleEndTime) return 0;
        return raffleEndTime - block.timestamp;
    }

    /// @notice Get all winner information after raffle completion
    /// @return Array of Winner structs containing addresses and prizes
    function getWinners() external view returns (Winner[WINNER_COUNT] memory) {
        return winners;
    }

    /// @notice Get the total number of entries (for transparency)
    /// @return Total number of ticket entries
    function getTotalEntries() external view returns (uint256) {
        return _entries.length;
    }

    /// @notice Get prize amount for a specific rank
    /// @param rank Winner rank (0-9, where 0 is first place)
    /// @return Prize amount in ROSE for that rank
    function getPrizeForRank(uint256 rank) external view returns (uint256) {
        if (rank >= WINNER_COUNT) return 0;
        return (address(this).balance * PRIZE_PERCENTAGES[rank]) / BASIS_POINTS;
    }

    // ============================================================
    //                     PRIVATE FUNCTIONS
    // ============================================================

    /// @dev Validates ticket purchase parameters
    /// @param quantity Number of tickets being purchased
    function _validatePurchase(uint256 quantity) private view {
        if (state != RaffleState.Active || block.timestamp >= raffleEndTime) {
            revert RaffleEnded();
        }
        if (quantity == 0) revert ZeroTickets();

        uint256 totalCost = TICKET_PRICE * quantity;
        if (msg.value != totalCost) {
            revert IncorrectPayment(msg.value, totalCost);
        }

        uint256 currentTickets = ticketsPurchased[msg.sender];
        if (currentTickets + quantity > MAX_TICKETS_PER_WALLET) {
            revert ExceedsWalletLimit(quantity, MAX_TICKETS_PER_WALLET - currentTickets);
        }

        if (ticketsSold + quantity > MAX_TOTAL_TICKETS) {
            revert ExceedsTotalSupply(quantity, MAX_TOTAL_TICKETS - ticketsSold);
        }
    }

    /// @dev Validates conditions required to draw winners
    function _validateDrawConditions() private view {
        if (state == RaffleState.Completed) revert RaffleAlreadyCompleted();
        if (block.timestamp < raffleEndTime && state == RaffleState.Active) {
            revert RaffleStillActive();
        }
        if (ticketsSold < WINNER_COUNT) revert NotEnoughParticipants();
    }

    /// @dev Selects winners using Sapphire's secure randomness
    /// @param totalPrizePool Total prize pool to distribute
    /// @return winnerAddresses Array of winner addresses
    /// @return prizeAmounts Array of prize amounts for each winner
    function _selectWinners(uint256 totalPrizePool)
        private
        returns (address[WINNER_COUNT] memory winnerAddresses, uint256[WINNER_COUNT] memory prizeAmounts)
    {
        uint256[] memory availableIndices = new uint256[](_entries.length);
        for (uint256 i = 0; i < _entries.length; i++) {
            availableIndices[i] = i;
        }
        uint256 remainingCount = _entries.length;

        for (uint256 rank = 0; rank < WINNER_COUNT; rank++) {
            address winnerAddress;
            uint256 attempts = 0;

            while (true) {
                bytes memory randomBytes = Sapphire.randomBytes(
                    32,
                    abi.encodePacked("roffle_winner", rank, block.timestamp, attempts)
                );
                uint256 randomIndex = uint256(bytes32(randomBytes)) % remainingCount;

                uint256 winnerEntryIndex = availableIndices[randomIndex];
                winnerAddress = _entries[winnerEntryIndex];

                if (!_isAlreadyWinner(winnerAddress, winnerAddresses, rank)) {
                    availableIndices[randomIndex] = availableIndices[remainingCount - 1];
                    remainingCount--;
                    break;
                }

                availableIndices[randomIndex] = availableIndices[remainingCount - 1];
                remainingCount--;
                attempts++;

                if (remainingCount == 0) revert NotEnoughParticipants();
            }

            uint256 prize = (totalPrizePool * PRIZE_PERCENTAGES[rank]) / BASIS_POINTS;

            winners[rank] = Winner({winner: winnerAddress, prize: prize});
            winnerAddresses[rank] = winnerAddress;
            prizeAmounts[rank] = prize;
        }
    }

    /// @dev Checks if an address has already been selected as a winner
    /// @param candidate Address to check
    /// @param winnerAddresses Array of already selected winners
    /// @param currentRank Current rank being selected (to limit search)
    /// @return True if candidate is already a winner
    function _isAlreadyWinner(
        address candidate,
        address[WINNER_COUNT] memory winnerAddresses,
        uint256 currentRank
    ) private pure returns (bool) {
        for (uint256 i = 0; i < currentRank; i++) {
            if (winnerAddresses[i] == candidate) return true;
        }
        return false;
    }

    /// @dev Distributes prizes to all winners
    function _distributePrizes() private {
        for (uint256 rank = 0; rank < WINNER_COUNT; rank++) {
            Winner memory w = winners[rank];
            (bool success, ) = payable(w.winner).call{value: w.prize}("");
            if (!success) revert PrizeTransferFailed(w.winner, w.prize);
            emit PrizeDistributed(w.winner, w.prize, rank + 1);
        }
    }

    /// @dev Refunds OPF contribution to owner
    function _refundOPFContribution() private {
        if (opfContribution > 0) {
            uint256 opfAmount = opfContribution;
            opfContribution = 0;
            _transferFunds(owner(), opfAmount, true);
            emit OPFContributionWithdrawn(opfAmount);
        }
    }

    /// @dev Refunds all ticket buyers
    function _refundAllBuyers() private {
        address[] memory processedBuyers = new address[](ticketsSold);
        uint256 processedCount = 0;

        for (uint256 i = 0; i < _entries.length; i++) {
            address buyer = _entries[i];

            bool alreadyProcessed = false;
            for (uint256 j = 0; j < processedCount; j++) {
                if (processedBuyers[j] == buyer) {
                    alreadyProcessed = true;
                    break;
                }
            }

            if (!alreadyProcessed && ticketsPurchased[buyer] > 0) {
                uint256 refundAmount = ticketsPurchased[buyer] * TICKET_PRICE;
                ticketsPurchased[buyer] = 0;
                processedBuyers[processedCount] = buyer;
                processedCount++;

                (bool success, ) = payable(buyer).call{value: refundAmount}("");
                if (!success) revert RefundTransferFailed(buyer, refundAmount);
                emit RefundIssued(buyer, refundAmount);
            }
        }
    }

    /// @dev Transfers funds to a recipient
    /// @param to Recipient address
    /// @param amount Amount to transfer
    /// @param isOwnerWithdrawal Whether this is an owner withdrawal (for error handling)
    function _transferFunds(address to, uint256 amount, bool isOwnerWithdrawal) private {
        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) {
            if (isOwnerWithdrawal) revert WithdrawalFailed();
        }
    }
}
