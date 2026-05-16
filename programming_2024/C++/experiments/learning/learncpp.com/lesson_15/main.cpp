#include <iostream>

class Calculator {
private:
  double m_x{};
public:
  Calculator (double x): m_x{x} {}
  Calculator& add(double x) {
    m_x += x;
    return *this;
  }
  Calculator& subtract(double x) {
    m_x -= x;
    return *this;
  }
  Calculator& multiply(double x) {
    m_x *= x;
    return *this;
  }
  Calculator& divide(double x) {
    m_x /= x;
    return *this;
  }
  int getNumber() const {
    return this->m_x;
  }
  Calculator& set(double x) {
    *this = {x};
    return *this;
  }
};




int main() {
  Calculator number {1000.0};
  std::cout << number.set(1).subtract(2).multiply(-1).add(5).getNumber();
  return 0;
}