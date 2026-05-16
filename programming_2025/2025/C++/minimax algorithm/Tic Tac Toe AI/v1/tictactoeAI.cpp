#include <iostream>
#include <sstream>
#include <array>
#include <string>
#include <cassert>
#include <chrono>

using namespace std::chrono_literals;

constexpr int boardSizeX {5};
constexpr int boardSizeY {5};
constexpr int inRow {4};
constexpr int totalTurns {2};

template <typename T, int sX, int sY>
using Array2d = std::array<std::array<T, sX>, sY>;

using Board = Array2d<int, boardSizeX, boardSizeY>;
void displayBoard(Board& board) {
    std::ostringstream oss;
    oss << "  ";
    for (int i = 1; i <= boardSizeX; ++i) {
        oss << i << ' ';
    }
    oss << "\n";
    int rowNumber {1};
    for (auto boardrow : board) {
        oss << rowNumber << ' ';
        for (auto i : boardrow) {
            switch (i) {
                case 0: 
                    oss << '_';
                    break;
                case 1:
                    oss << 'X';
                    break;
                case 2:
                    oss << 'O';
                    break;
            }
            oss << ' ';
        } 
        oss << '\n';
        ++rowNumber;
    }
    std::cout << oss.str() << std::endl;
}

bool checkForWinRow(Board& board, int modX, int modY, int changeX, int changeY) {
    int turn {board[modX][modY]};
    if (turn == 0) std::cout << "\n\n\n\n\n!!!!!!!!!!!!!!!!!!!TURN IS 0!!!!!!!!!!!!!!!!!!!!!!!!!\n\n\n\n\n";
    int currentInRow {0};
    for (int step = -inRow+1; step <= inRow; ++step) {
        int placeX {modX + changeX*step};
        if (placeX < 0 || placeX >= boardSizeX) continue;
        int placeY {modY + changeY*step};
        if (placeY < 0 || placeY >= boardSizeY) continue;
        //std::cout << placeX << "," << placeY << " = " << board[placeX][placeY] << "\n";
        if (board[placeX][placeY] != turn) {
           currentInRow = 0;
        } else {
            ++currentInRow;
        }
        if (currentInRow == inRow) return true;
    }        
    return false;
}

bool checkForWin(Board& board, int modX, int modY) {
    if (checkForWinRow(board, modX, modY, 1, 0)) return true;
    if (checkForWinRow(board, modX, modY, 0, 1)) return true;
    if (checkForWinRow(board, modX, modY, 1, 1)) return true;
    if (checkForWinRow(board, modX, modY, 1, -1)) return true;
    return false;
}

bool checkForTie(const Board& board) {
    for (auto boardRow : board) {
        for (int i : boardRow) {
            if (i == 0) return false;
        }
    }
    return true;
}

struct BoardMove {
    int x;
    int y;
};

                int DEBUG_totalmovescalculated {0};
int getScore(Board& board, int depth, int turn, int alpha = -1000000, int beta = 1000000) {
    if (depth == 0) return 0;
    bool ismax {depth % 2 == 0};
    int bestScore {1000000 * (ismax ? -1 : 1)};
    for (int x = 0; x < boardSizeX; ++x) {
        for (int y = 0; y < boardSizeY; ++y) {
            if (board[x][y] != 0) continue;
            ++DEBUG_totalmovescalculated;
            board[x][y] = turn;
            
            if (checkForWin(board, x, y)) {
                board[x][y] = 0;
                return (ismax ? 10000 : -10000) + depth;
            }
            if (checkForTie(board)) {
                board[x][y] = 0;
                return 0;
            }
            int score {getScore(board, depth - 1, turn%totalTurns+1, alpha, beta)};
            if (ismax) {
                if (bestScore < score) {
                    bestScore = score;
                }
                if (alpha < score) {
                    alpha = score;
                }
                if (score >= beta) {
                    board[x][y] = 0;
                    return score;
                }
            } else {
                if (bestScore > score) {
                    bestScore = score;
                }
                if (beta > score) {
                    beta = score;
                }
                if (score <= alpha) {
                    board[x][y] = 0;
                    return score;
                }
            }
            board[x][y] = 0;
        }
    }
    return bestScore;// * (ismax ? 1 : -1);
}

int getNumberOfMoves(Board& board) {
    int allMovesCount {0};
    for (int x = 0; x < boardSizeX; ++x) {
        for (int y = 0; y < boardSizeY; ++y) {
            if (board[x][y] == 0) ++allMovesCount;
        }
    }
    return allMovesCount;
}
std::string repeatString(std::string_view string, int number) {
    std::string newstring {""};
    for (int i = 0; i < number; ++i) {
        newstring += string;
    }
    return newstring;
}
BoardMove getBestMove(Board& board, int depth, int turn) {
                    DEBUG_totalmovescalculated = 0;
    int bestScore {999999999};
    BoardMove bestMove {-100,-100};
    int numberOfMoves {getNumberOfMoves(board)};
    //                std::cout << "getting best move("<<numberOfMoves<<" moves)\n";
    std::cout << repeatString("|", numberOfMoves) << "\n";
    for (int x = 0; x < boardSizeX; ++x) {
        for (int y = 0; y < boardSizeY; ++y) {
            if (board[x][y] != 0) continue;
                            std::cout << "|" << std::flush;
            Board newboard {board};
            newboard[x][y] = turn;
            //                displayBoard(newboard);
            if (checkForWin(newboard, x, y)) {
                bestMove.x = y;
                bestMove.y = x;
                //                std::cout << "\nEARLY RETURN; WINNING MOVE FOUND\n";
                //                std::cout << "The AI has computed " << DEBUG_totalmovescalculated << " moves and has made a decision\n";
                return bestMove;
            }
            int score {getScore(newboard, depth, turn%totalTurns+1)};
            //                std::cout << "\nScore " << score << "\n\n\n";
            if (score < bestScore) {
                bestScore = score;
                bestMove.x = y;
                bestMove.y = x;
            }
            //            std::cout << DEBUG_totalmovescalculated << " calculated\n";
        }
    }
    //                std::cout << "\nThe AI has computed " << DEBUG_totalmovescalculated << " moves and has made a decision\n";
                    //std::cout << repeatString("|", std::floor(100/string_count)*string_count) << '\n';
    return bestMove;
}

int main() {
    while (true) {
        Board board {};
        /*displayBoard(board);
        BoardMove move {getBestMove(board, 10, 2)};
        std::cout << "BEST MOVE: (" << move.x+1 << "," << move.y+1 << ")";
        return 0;*/
    
        [[maybe_unused]] int totalMoves {0};
        int turn {0};
        while (true) {
            std::cout << "Turn " << (turn + 1) << "\n";
            displayBoard(board);
            int placeX {0};
            int placeY {0};
            
            if (turn == 0) { 
                std::cout << "X: ";
                std::cin >> placeX;
                --placeX;
                std::cout << "Y: ";
                std::cin >> placeY;
                --placeY;
            } else {
                int depth {6};
                std::cout << "depth " << depth << ":\n";
                BoardMove bestMove {getBestMove(board, depth, turn+1)};
                depth += 2;
                auto timelimit {std::chrono::system_clock::now() + 2s};
                while (depth <= getNumberOfMoves(board) && (std::chrono::system_clock::now() < timelimit)) {
                    std::cout << "\ndepth " << depth << ":\n";
                    //timelimit = std::chrono::system_clock::now() + 1s;
                    bestMove = getBestMove(board, depth, turn+1); 
                    depth += 2;
                }
                std::cout << "Best move with depth " << depth - 2 << ": (" << (bestMove.x+1) << "," << (bestMove.y+1) << ")\n";
                placeX = bestMove.x;
                placeY = bestMove.y;//*/
                
            }
            if (board[placeY][placeX] != 0) {
                std::cout << "INVALID MOVE\n";
                continue;
            }
            board[placeY][placeX] = turn + 1;
            ++totalMoves;
            if (checkForWin(board, placeY, placeX)) break;
            if (checkForTie(board)) break;
            //std::cout << "SCORE(" << getScore(board, 4, turn) << ")";
            turn = (turn + 1) % totalTurns;//*/
        }
        std::cout << "\n";
        displayBoard(board);
        std::cout << "\n\n\n";
        if (checkForTie(board)) {
            std::cout << "TIE" << std::endl;
        } else {
            std::cout << "PLAYER " << turn+1 << " WINS!" << std::endl;
        }
        break;
        std::cout << "\n\n\n\n\nSTARTING ANOTHER GAME...\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n";
    }
}