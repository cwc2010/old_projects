#include <iostream>
#include <thread>
#include <vector>
#include <queue>
#include <functional>
#include <mutex>
#include <condition_variable>
#include <atomic>

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

    ~ThreadPool() {
        {
            std::unique_lock<std::mutex> lock(p_queue_mutex);
            p_stopped = true;
        }

        p_cv.notify_all();

        for (auto& thread : p_threads) {
            thread.join();
        }
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

int main() {
    constexpr double target {1'000'000'000};
    constexpr int divisions {16};
    //static_assert(target%divisions == 0);
    constexpr int chunksize {static_cast<int>(target)/divisions};
    ThreadPool pool{8};
    std::atomic<int> counter {0};
    for (int i = 0; i < divisions; ++i) {
        pool.enqueue([i, &counter] {
            double localCounter {0};
            for (int j = 0; j < chunksize*10; ++j) {
                for (int x = 0; x < 10; ++x) localCounter += 0.01;
            }
            counter += localCounter;
            std::cout << "finished a task\n";
        });
    }
    while (counter < target) {
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    std::cout << counter << "\n";
}
