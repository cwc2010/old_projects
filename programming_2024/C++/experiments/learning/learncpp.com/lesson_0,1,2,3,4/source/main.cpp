#include <iostream>
//#include "headers/header.h"

#define result "Test, Answer: "

void testOutput() {
  std::cout << "    printing true: " << true << "\n";
  std::cout << "    printing false: " << false << "\n";
  std::cout << "    printing 1: " << 1 << "\n";
  std::cout << "    printing 0: " << 0 << "\n";
  std::cout << "    printing 2: " << 2 << "\n";
  std::cout << "    printing -1: " << -1 << "\n";
}
int main() {
  int int1;
  int int2;
  std::cout << "First number ";
  std::cin >> int1;
  std::cout << "Second number ";
  std::cin >> int2;
  //std::cout << result << add(int1, int2);
  std::cout << result << int1 + int2 << "\n";
  std::cout << "Size of " << int1 << ": " << sizeof(int1) << "\n";
  std::cout << "Size of " << int2 << ": " << sizeof(int2) << "\n";
  unsigned int test = -123;
  std::cout << "Printing negative unsigned integer: " << test << "\n";

  std::cout << "testing\n";
  testOutput();
  std::cout << "printing std::boolalpha\n";
  std::cout << std::boolalpha;
  testOutput();
  std::cout << "printing std::noboolalpha\n";
  std::cout << std::noboolalpha;
  testOutput();
  std::cout << "-----\n\n\n-----";
  double pi = 3.14159265;
  std::cout << "pi: " << pi << "\n";
  std::cout << "static_cast: " << static_cast<int>(pi) << "\n";
  std::int8_t int8_t_test = 50;
  std::cout << "int8_t type variable: " << int8_t_test << "\n";
  return 0;
}
