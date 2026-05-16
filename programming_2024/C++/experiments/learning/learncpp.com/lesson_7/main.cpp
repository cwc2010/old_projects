#include <iostream>
#include "headers.h"
#include "constants.h"

static int s_onlyInThisFile = 1234;
const int s_alsoOnlyInThisFile = 5678;

void hello() {
  std::cout << "hello\n";
}
inline namespace version1 {
  int test1 () {
    return 1;
  }
}
namespace version2 {
  int test1 () {
    return 2;
  }
}
int main () {
  namespace testAlias = NamespaceTest::test;

  int number = 2;

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

  if constexpr (constants::gravity == 9.8) {
    std::cout << "gravity == 9.8";
  } else {
    std::cout << "gravity != 9.8";
  }
  std::cout << "\n";

  std::cout << "version 1: " << test1() << "\n";
  std::cout << "version 2: " << version2::test1() << "\n";

  std::cout << testAlias::uniqueID() << "\n";
  std::cout << testAlias::uniqueID() << "\n";
  std::cout << testAlias::uniqueID() << "\n";

  std::cout << "gravity: " << constants::gravity << "\n";

  std::cout << s_onlyInThisFile << "\n";
  std::cout << s_alsoOnlyInThisFile << "\n";

  std::cout << g_test << "\n";

  NamespaceTest::hello2();
  std::cout << "5*11 = " << NamespaceTest::test::product(5,11) << "\n";
  std::cout << "area of square with side = 5: " << NamespaceTest::test::squareArea(5) << "\n";
  std::cout << "123*456 = " << testAlias::product(123,456);

  std::cout << "";;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
  std::cout << NamespaceTest::add(1,2) << "\n";

  return 0;
}