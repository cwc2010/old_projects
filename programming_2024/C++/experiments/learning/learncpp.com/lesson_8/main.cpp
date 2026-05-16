#include <iostream>
#include <random>
#include <chrono>

int main () {
  std::mt19937 mt19937 = std::random_device{}();
  std::uniform_int_distribution randomNumber{1,6};
  for (int i = 0; i <= 10000; i++) {
    std::cout << randomNumber(mt19937) << ", ";
  }

  int number = 1;

  while (number < 100) {
    std::cout << number;
    if (number % 10 == 0) {
      std::cout << "! ";
    } else {
      std::cout << ", ";
    }
    ++number;
  }
  std::cout << number << "\n";

  number = 2;

  switch (number) {
  case 1:
    std::cout << "one";
    break;
  case 2:
    std::cout << "two";
    break;
  case 3:
    std::cout << "three";
    break;
  default:
    std::cout << "number not in range";
    break;
  }
  std::cout << "\n";

  number = 2;

  std::cout << "the number " << number;
  switch (number) {
  case 1:
    std::cout << "one";
    break;
  case 2:
    std::cout << " is even and";
    [[fallthrough]];
  case 3:
  case 5:
  case 7:
  case 11:
  case 13:
  case 17:
  case 19:
    std::cout << " is a prime number ";
    std::cout << "less than 20";
    break;
  default:
    std::cout << " is composite or greater than 20";
  }
  std::cout << "\n";

  constexpr double gravity = 9.8;
  if constexpr (gravity == 9.8) {
    std::cout << "gravity == 9.8";
  } else {
    std::cout << "gravity != 9.8";
  }
  std::cout << "\n";
  return 0;
}