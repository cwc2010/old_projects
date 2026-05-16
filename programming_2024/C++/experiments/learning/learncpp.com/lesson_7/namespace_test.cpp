#include <iostream>
#include "headers.h"

extern const int g_test = 3;

namespace NamespaceTest {
  int add(int x, int y) {
    return x+y;
  }
}
namespace NamespaceTest {
  namespace test {
    int product(int x, int y) {
      return x * y;
    }
  }
  void hello() {
    std::cout << "hello in NamespaceTest\n";
  }
  void hello2() {
    ::hello();
    hello();
  }
}
namespace NamespaceTest::test {
  int squareArea(int side) {
    return side * side;
  }
  int uniqueID() {
    static int i = 0;
    return ++i;
  }
}

