#include <iostream>
#include <typeinfo>
#include <optional>

std::optional<double> reciprocal(double x) {
  if (x == 0) {
    return std::nullopt;
  }
  return 1/x;
}
void printString(const std::string& string) {
  std::cout << string << "\n";
}
void incrementInt(int& value) {
  std::cout << "!" << value << "\n";
  ++value;
}
const double& getPI() { // returns reference
  const static double PI = 3.14159265;
  return PI;
}

int main () {
  int number = 5;

  std::optional reciprocalResultPtr = reciprocal(100);
  if (reciprocalResultPtr) {
    std::cout << *reciprocalResultPtr << "\n";
  } else {
    std::cout << "error\n";
  }

  reciprocalResultPtr = reciprocal(0);
  if (reciprocalResultPtr) {
    std::cout << *reciprocalResultPtr << "\n";
  } else {
    std::cout << "error\n";
  }

  std::cout << "PI: " << getPI() << "\n";

  number = 5;
  int* numberPtr = &number;
  int* const constNumberPtr = &number;

  std::cout << "address: " << numberPtr << "\n";
  std::cout << "value at address " << numberPtr << ": " << *numberPtr << "\n";
  *numberPtr = 1234;
  std::cout << "new number: " << number << "\n";
  numberPtr = nullptr;
  std::cout << (numberPtr == nullptr) << "\n";

  number = 5;
  std::cout << number << "\n";
  incrementInt(number);
  std::cout << number << "\n";
  std::string hello = "hello";
  printString(hello);

  double gravity = 9.8;
  double& gravityRef = gravity;
  std::cout << "gravity: " << gravityRef << "\n";
  --gravityRef;
  std::cout << "new gravity: " << gravity << "\n";
  gravityRef = number;
  std::cout << gravityRef << "\n";
  number = 100;
  std::cout << gravityRef << "\n";
  const double& unchangableGravityRef = gravity;
  const int& rvalueRef = 10;
  std::cout << rvalueRef << "\n";
  return 0;
}