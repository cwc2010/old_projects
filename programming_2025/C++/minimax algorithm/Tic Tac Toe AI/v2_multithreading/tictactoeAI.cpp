#include <iostream>
#include <sstream>
#include <array>
#include <string>
#include <cassert>
#include <chrono>
#include <thread>
#include <mutex>
#include <atomic>

using namespace std::chrono_literals;

constexpr int boardSizeX {4};
constexpr int boardSizeY {4};
constexpr int inRow {4};
constexpr int totalTurns {2};


template <typename T, int sX, int sY>
using Array2d = std::array<std::array<T, sX>, sY>;

using Board = Array2d<int, boardSizeX, boardSizeY>;

struct Point2d {
    int x;
    int y;
};

struct BoardMove {
    int x;
    int y;
};

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

bool checkForTie(Board& board) {
    for (auto boardRow : board) {
        for (int i : boardRow) {
            if (i == 0) return false;
        }
    }
    return true;
}

int getScore(Board& board, int depth, int turn, int alpha = -1000000, int beta = 1000000) {
    if (depth == 0) return 0;
    bool ismax {depth % 2 == 0};
    int bestScore {1000000 * (ismax ? -1 : 1)};
    for (int x = 0; x < boardSizeX; ++x) {
        for (int y = 0; y < boardSizeY; ++y) {
            if (board[x][y] != 0) continue;
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


class ThreadPool {
public:
    ThreadPool(std::size_t num_threads = std::thread::hardware_concurrency()) {
        for (std::size_t i = 0; i < num_threads; ++i) {
            p_threads.emplace_back([this] {
                while (true) {
                    std::function<void()> task;
                    {
                        std::unique_lock<std::mutex> lock(p_queue_mutex);

                        p_cv.wait(lock, [this] {
                            return !p_tasks.empty() || p_stopped;
                        });

                        if (p_stopped && p_tasks.empty()) {
                            return;
                        }

                        task = std::move(p_tasks.front());
                        p_tasks.pop();
                    }
                    task();
                }
            });
        }
    }

    void stop () {
        {
            std::unique_lock<std::mutex> lock(p_queue_mutex);
            p_stopped = true;
        }

        p_cv.notify_all();

        for (auto& thread : p_threads) {
            thread.join();
        }
    }
    ~ThreadPool() {
        stop();
    }

    void enqueue(std::function<void()> task) {
        {
            std::unique_lock<std::mutex> lock(p_queue_mutex);
            p_tasks.emplace(std::move(task));
        }
        p_cv.notify_one();
    }

private:
    std::vector<std::thread> p_threads;
    std::queue<std::function<void()>> p_tasks;
    std::mutex p_queue_mutex;
    std::condition_variable p_cv;
    bool p_stopped = false;
};

BoardMove getBestMoveMultithreading(Board& board, int depth, int turn) {
    std::atomic<int> bestScore {999999999};
    std::atomic<int> bestMoveX {-100};
    std::atomic<int> bestMoveY {-100};
    std::atomic<int> tasksFinished {0};
    std::atomic<bool> stopAll {false};


    ThreadPool pool {std::thread::hardware_concurrency()};

    std::mutex mutex_lock;
    int totalTasks {0};
    for (int x = 0; x < boardSizeX; ++x) {
        for (int y = 0; y < boardSizeY; ++y) {
            if (board[x][y] != 0) continue;
            pool.enqueue([&stopAll, &tasksFinished, &bestScore, &bestMoveX, &bestMoveY, &mutex_lock, &board, depth, turn, x, y] {
                if (stopAll.load()) return;
                int localBestScore {bestScore};
                int localBestMoveX {bestMoveX};
                int localBestMoveY {bestMoveY};
                bool hasChanged {false};
                Board newboard = board; // copy constructor
                newboard[x][y] = turn;
                if (checkForWin(newboard, x, y)) {
                    localBestMoveX = y;
                    localBestMoveY = x;
                    localBestScore = 1000000000;
                    hasChanged = true;
                    stopAll = true;
                } else {
                    int score {getScore(newboard, depth, turn%totalTurns+1)};
                    if (score < localBestScore) {
                        localBestScore = score;
                        localBestMoveX = y;
                        localBestMoveY = x;
                        hasChanged = true;
                    }
                }
                tasksFinished.fetch_add(1);
                {
                    std::lock_guard<std::mutex> lock (mutex_lock);
                    if (hasChanged) {
                        bestScore = localBestScore;
                        bestMoveX = localBestMoveX;
                        bestMoveY = localBestMoveY;
                    }
                }

                std::cout << "█" << std::flush;
            });
            ++totalTasks;
            std::cout << "█";
        }
    }
    std::cout << "\n";

    while (tasksFinished < totalTasks) {
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }

    return BoardMove{bestMoveX, bestMoveY};
}
int main() {
    while (true) {
        Board board {};
    
        int turn {0};
        displayBoard(board);
        while (true) {
            std::cout << "Player " << (turn==0?'X':'O') << ":\n";
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
                int depth {16};
                std::cout << "depth " << depth << ":\n";
                BoardMove bestMove {getBestMoveMultithreading(board, depth, turn+1)};
                depth += 2;
                auto timelimit {std::chrono::system_clock::now() + 5s};
                while (depth <= getNumberOfMoves(board)+1 && (std::chrono::system_clock::now() < timelimit)) {
                    std::cout << "\ndepth " << depth << ":\n";
                    bestMove = getBestMoveMultithreading(board, depth, turn+1); 
                    depth += 2;
                }
                std::cout << "\nPlaying best move with depth " << depth - 2 << ": (" << (bestMove.x+1) << "," << (bestMove.y+1) << ")\n";
                placeX = bestMove.x;
                placeY = bestMove.y;//*/
                
            }
            if (board[placeY][placeX] != 0) {
                std::cout << "INVALID MOVE\n";
                continue;
            }
            board[placeY][placeX] = turn + 1;
            if (checkForWin(board, placeY, placeX)) break;
            if (checkForTie(board)) break;
            //std::cout << "SCORE(" << getScore(board, 4, turn) << ")";
            turn = (turn + 1) % totalTurns;//*/
            displayBoard(board);
        }
        std::cout << "\n";
        displayBoard(board);
        std::cout << "\n\n\n";
        if (checkForTie(board)) {
            std::cout << "TIE" << std::endl;
        } else {
            std::cout << "PLAYER " << (turn==0?'X':'O') << " WINS!" << std::endl;
        }
        break;
        std::cout << "\n\n\n\n\nSTARTING ANOTHER GAME...\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n";
    }
}








