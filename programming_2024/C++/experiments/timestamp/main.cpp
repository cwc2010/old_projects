#include <iostream>
#include <chrono>
#include <assert.h>

void passByValue(std::string string) {}

void passByReference(std::string& string) {}

void passByView(std::string_view string) {}

auto getNow() {
  return std::chrono::steady_clock::now();
}

template <typename T>
void printTimestamp(T start, T end) {
  std::cout << (std::chrono::duration_cast<std::chrono::milliseconds>(end-start)).count();
}

std::string hello = "";

void testFunction1(int iterations) {
  for (int i = 0; i < iterations; ++i) {
    passByValue(hello);
  }
}
void testFunction2(int iterations) {
  for (int i = 0; i < iterations; ++i) {
    passByReference(hello);
  }
}
void testFunction3(int iterations) {
  for (int i = 0; i < iterations; ++i) {
    passByView(hello);
  }
}

int main() {
  constexpr int startValue = 0;
  constexpr int stopValue = 100'000'000;
  constexpr int iterations = 100000;
  constexpr int increment =  (stopValue - startValue) / iterations;
  std::cout << "Iterations\tVal\tRef\tView\n";
  for (int i = startValue; i < stopValue; i += increment) {
    auto start {getNow()};
    testFunction1(i);
    std::cout << i << "\t";
    printTimestamp(start, getNow());
    
    start = getNow();
    testFunction2(i);
    std::cout << "\t";
    printTimestamp(start, getNow());
    
    start = getNow();
    testFunction3(i);
    std::cout << "\t";
    printTimestamp(start, getNow());
    std::cout << "\n";
  }
  return 0;
}