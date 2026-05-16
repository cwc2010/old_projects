#include <bitset>
#include <algorithm>
#include <iostream>

int add(int a, int b) {
  return a + b;
}

int main () {
  std::bitset<8> bits = 0b00000000;
  std::cout << "bits: " << bits << "\n";
  bits.set(0);
  bits.set(2);
  std::cout << "bits: " << bits << "\n";
  bits.flip(1);
  bits.flip(3);
  std::cout << "bits: " << bits << "\n";
  bits.reset(0);
  std::cout << "bits: " << bits << "\n";
  std::cout << bits.size() << " bits total\n";
  std::cout << bits.count() << " bits set to true\n";
  std::cout << "~bits:" << ~bits << "\n";
  std::cout << "bits | 0b011000010: " << (bits | std::bitset<8>{0b1100010}) << "\n";
  std::cout << "bits & 0b10101010: " << (bits & std::bitset<8>{0b10101010}) << "\n";
  std::cout << "bits ^ 0b10101010: " << (bits ^ std::bitset<8>{0b10101010}) << "\n";


  std::cout << std::boolalpha;
  std::cout << "0.3 == 0.1 + 0.2: " << (0.3 == 0.1+0.2) << "\n";
  std::cout << std::noboolalpha;
  int x = 0;
  std::cout << "value: " << add(x, ++x) << "\n";
  return 0;
}