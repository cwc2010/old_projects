#include <iostream>
#include "add.h"

int overload (int x, int y) {
  return x+y;
}

int overload (int x, int y, int z) {
  return x+y+z;
}

double overload (double x, double y) {
  return x+y;
}

int defaultValue (int x = 0) {
  return x;
}

void printInt(int x){
  std::cout << x << "\n";
}

void printInt(char) = delete;
void printInt(bool) = delete;

template <typename U>

void listValue(U x) {
  static int i = 1;
  std::cout << i << ". " << x << "\n";
  ++i;
}

template <auto N>
void printValue() {
  std::cout << N << "\n";
}
int main() {
  printValue<1>();

  std::cout << add(10, 5) << "\n";
  std::cout << add(10, 5.5) << "\n";
  std::cout << add(13.5, 2.5) << "\n";
  std::cout << add(1,2,3) << "\n";

  listValue(8);
  listValue(4);
  listValue(2);
  listValue(1);
  listValue(0.5);
  listValue(0.25);

  printInt(5);
  // printInt('a');

  std::cout << add<int>(10, 5) << "\n";

  std::cout << defaultValue() << "\n";
  std::cout << overload(0.1, 0.1) << "\n"; 
  return 0;
}