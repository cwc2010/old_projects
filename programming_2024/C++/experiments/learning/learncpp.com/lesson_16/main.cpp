#include <iostream>
#include <vector>

namespace Test {
  enum Numbers : unsigned int {
    one,
    two,
    three,
    four,
    five,
    six,
    seven,
    eight,
    nine,
    ten,
    max,
  };
};


template <typename T>
void printVectorData (const std::vector<T>& vector) {
  int i = 0;
  for (auto val : vector) {
    if (i != 0) {
      std::cout << ",";
    }
    std::cout << val;
    ++i;
  }
  std::cout << "\tSize: " << vector.size() << "\tCapacity: " << vector.capacity() << "\n";
}

int main() {
  std::vector<int> even(100);

  for (int i = 0; i < 100; ++i) {
    even[i] = (i+1)*2;
  }

  for (int i : even) {
    std::cout << i << ",";
  }
  std::cout << "\n";

  std::cout << Test::Numbers::max << " numbers\n";

  std::vector<std::string> numbers {"one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"};

  for (const std::string& number : numbers) {
    std::cout << number << ", ";
  }
  std::cout << "\n";

  std::vector<int> prime {0,3,5,7,11};
  printVectorData(prime);
  prime.resize(10);
  printVectorData(prime);
  prime[5] = 13;
  printVectorData(prime);
  prime.reserve(20);
  printVectorData(prime);
  std::cout << "Second prime number: " << prime[1] << "\n";
  return 0;
}