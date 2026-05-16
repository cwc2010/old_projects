#include <iostream>
#include <sstream>
#include <array>
#include <string>
#include <cassert>
#include <chrono>
#include <thread>
#include <mutex>
#include <atomic>
#include <condition_variable>
#include <string_view>
#include <fstream>
#include <vector>

using namespace std::chrono_literals;

int boardSize {3};
int inRow {3};
constexpr int int_min {-2147483647};
constexpr int int_max {2147483647};


using Board = std::vector<std::vector<int>>;

//using Board = Array2d<int, boardSize, boardSize>;


struct BoardMove {
    int x;
    int y;
};


constexpr int nextTurn (int turn) {
    turn = turn % 2 + 1;
    return turn;
}


void displayBoard(Board& board) {
    std::ostringstream oss;
    oss << "\n  ";
    for (int i = 1; i <= boardSize; ++i) {
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
    int turn {board[modY][modX]};
    if (turn == 0) std::cout << "\n\n\n\n\n!!!!!!!!!!!!!!!!!!!TURN IS 0!!!!!!!!!!!!!!!!!!!!!!!!!\n\n\n\n\n";
    int currentInRow {0};
    for (int step = -inRow+1; step <= inRow; ++step) {
        int placeX {modX + changeX*step};
        if (placeX < 0 || placeX >= boardSize) continue;
        int placeY {modY + changeY*step};
        if (placeY < 0 || placeY >= boardSize) continue;
        if (board[placeY][placeX] != turn) {
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

int getScore(Board& board, int depth, int turn, bool ismax, int alpha = int_min, int beta = int_max) {
    if (depth == 0) return 0;

    int bestScore {int_min*(ismax?1:-1)};
    for (int x = 0; x < boardSize; ++x) {
        for (int y = 0; y < boardSize; ++y) {
            if (board[y][x] != 0) continue;
            board[y][x] = turn;

            if (checkForWin(board, x, y)) {
                board[y][x] = 0;
                return (depth + 1) * (ismax ? 1 : -1);
            }
            if (checkForTie(board)) {
                board[y][x] = 0;
                return 0;
            }
            int score {getScore(board, depth - 1, nextTurn(turn), !ismax, alpha, beta)};
            if (ismax) {
                if (bestScore < score) {
                    bestScore = score;
                }
                if (alpha < score) {
                    alpha = score;
                }
                if (score >= beta) {
                    board[y][x] = 0;
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
                    board[y][x] = 0;
                    return score;
                }
            }
            board[y][x] = 0;
        }
    }
    return (bestScore == int_max || bestScore == int_min) ? -1 : bestScore;
}

int getNumberOfMoves(Board& board) {
    int allMovesCount {0};
    for (int x = 0; x < boardSize; ++x) {
        for (int y = 0; y < boardSize; ++y) {
            if (board[y][x] == 0) ++allMovesCount;
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
    std::atomic<int> bestScore {int_min};
    std::atomic<int> bestMoveX {int_min};
    std::atomic<int> bestMoveY {int_min};
    std::atomic<int> tasksFinished {0};
    std::atomic<bool> stopAll {false};


    ThreadPool pool {std::thread::hardware_concurrency()};
    std::ostringstream taskBaross;
    auto mutex_lock = std::make_shared<std::mutex>();
    int totalTasks {0};
    for (int x = 0; x < boardSize; ++x) {
        for (int y = 0; y < boardSize; ++y) {
            if (board[y][x] != 0) continue;
            pool.enqueue([&stopAll, &tasksFinished, &bestScore, &bestMoveX, &bestMoveY, mutex_lock, &board, depth, turn, x, y] {
                if (stopAll.load()) {
                    tasksFinished.fetch_add(10000);
                    return;
                }
                int localScore {0};
                int localMoveX {0};
                int localMoveY {0};
                Board newboard = board;
                newboard[y][x] = turn;
                if (checkForWin(newboard, x, y)) {
                    localMoveX = x;
                    localMoveY = y;
                    localScore = int_max;
                    stopAll = true;
                    tasksFinished.fetch_add(1);
                } else {
                    int score {getScore(newboard, depth, nextTurn(turn), false, bestScore.load(), int_max)};
                    localScore = score;
                    localMoveX = x;
                    localMoveY = y;
                }

                tasksFinished.fetch_add(1);
                {
                    std::lock_guard<std::mutex> lock (*mutex_lock);
                    if (bestScore.load() < localScore) {
                        bestScore = localScore;
                        bestMoveX = localMoveX;
                        bestMoveY = localMoveY;
                    }
                }

                std::cout << '|' << std::flush;
            });
            ++totalTasks;
            taskBaross << '|';
        }
    }
    taskBaross << '\n';
    std::cout << taskBaross.str();

    while (tasksFinished < totalTasks && !stopAll) {
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
    return BoardMove{bestMoveX, bestMoveY};
}


char displayTurn (int turn) {
    return turn == 1 ? 'X' : 'O';
}
int main() {
    int minaidepth {4};
    int maxaidepth {int_max};
    int maxaitime {50};

    std::ofstream historyFile;
    historyFile.open(".tictactoeAI/v3.1_customization/history.txt", std::ios::app);

    while (true) {
        std::cout << "Enter tic tac toe rules(current size = " << boardSize << ", in row = " << inRow << ")\n";
        std::string cininput {};

        while (true) {
            std::cout << "Board size: ";
            std::cin >> cininput;
            try {
                boardSize = std::stoi(cininput);
            } catch (int unused) {}
            if (boardSize > 0) break;
            std::cout << "Please enter a valid number\n";
        }


        while (true) {
            std::cout << "In row: ";
            
            std::cin >> cininput;
            try {
                inRow = std::stoi(cininput);
            } catch (int unused) {}
            if (inRow > 0) break;
            std::cout << "Please enter a valid number\n";
        }

        if (maxaidepth == int_max) {
            std::cout << "Min AI depth: " << minaidepth << ", ";
        } else {
            std::cout << "AI depth: " << minaidepth << " to " << maxaidepth << ", ";
        }
        if (maxaitime == int_max) {
            std::cout << "unlimited time";
        } else {
            std::cout << "max time " << maxaitime << "ms";
        }

        std::cout << "\nChange AI settings? (y/n): ";
        std::cin >> cininput;
        if (cininput == "y" || cininput == "Y") {
            while (true) {
                std::cout << "Min depth: ";
                
                std::cin >> cininput;
                try {
                    minaidepth = std::stoi(cininput);
                } catch (int unused) {}
                if (minaidepth > 0) break;
                std::cout << "Please enter a valid number\n";
            }

            while (true) {
                std::cout << "Max depth(i for infinite): ";
                
                std::cin >> cininput;
                try {
                    if (cininput == "i" || cininput == "I") {
                        maxaidepth = int_max;
                    } else {
                        maxaidepth = std::stoi(cininput);
                    }
                } catch (int unused) {}
                if (maxaidepth > 0 && minaidepth <= maxaidepth) break;
                std::cout << "Please enter a valid number\n";
            }

            while (true) {
                if (minaidepth == maxaidepth) break;
                std::cout << "Max time(ms, i for infinite): ";
                
                std::cin >> cininput;
                try {
                    if (cininput == "i" || cininput == "I") {
                        maxaitime = int_max;
                    } else {
                        maxaitime = std::stoi(cininput);
                    }
                } catch (int unused) {}
                if (maxaitime > 0) break;
                std::cout << "Please enter a valid number\n";
            }
            
        }

        Board board(boardSize, std::vector<int>(boardSize, 0));
    
        int turn {1};
        displayBoard(board);
        while (true) {
            std::cout << "Player " << displayTurn(turn) << ":\n";
            int placeX {0};
            int placeY {0};
            
            if (turn == 1) { 
                std::cout << "X: ";
                std::cin >> placeX;
                --placeX;
                std::cout << "Y: ";
                std::cin >> placeY;
                --placeY;
            } else {
                auto timelimit {std::chrono::system_clock::now() + std::chrono::milliseconds(maxaitime)};

                int depth {minaidepth};
                std::cout << "depth " << depth << ":\n";
                BoardMove bestMove {getBestMoveMultithreading(board, depth, turn)};
                ++depth;
                std::cout << maxaitime;
                while ((std::chrono::system_clock::now() < timelimit) && depth <= getNumberOfMoves(board)+1 && depth <= maxaidepth) {
                    std::cout << "\ndepth " << depth << ":\n";
                    bestMove = getBestMoveMultithreading(board, depth, turn); 
                    ++depth;
                }
                placeX = bestMove.x;
                placeY = bestMove.y;
            }
            if (board[placeY][placeX] != 0) {
                std::cout << "INVALID MOVE\n";
                continue;
            }
            board[placeY][placeX] = turn;
            if (checkForWin(board, placeX, placeY)) break;
            if (checkForTie(board)) break;
            turn = nextTurn(turn);
            displayBoard(board);
        }
        std::cout << "\n";
        displayBoard(board);
        std::cout << "\n\n\n";
        if (checkForTie(board)) {
            std::cout << "TIE. ";
        } else {
            std::cout << "PLAYER " << displayTurn(turn) << " WINS! ";
        }
        std::cout << "Start another game?(y/n) ";
        std::string option {};
        std::cin >> option;
        if (option != "y" && option != "Y") break;
    }
}