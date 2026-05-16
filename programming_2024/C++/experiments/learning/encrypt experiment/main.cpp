#include <iostream>
#include <bitset>
#include <cmath>

std::bitset<24> toBinary(int toEncrypt) {
  std::bitset<24> bits;
  for (int i = 0; i < 24; ++i) {
    if (static_cast<int>(std::floor(toEncrypt)) % 2 == 0) {
      bits.reset(i);
    } else {
      bits.set(i);
    }
    toEncrypt /= 3;
  }
  return bits;
}

int toDecimal(std::bitset<24> bits) {
  int value = 0;
  int multiplier = 1;
  for (int i = 0; i < 24; ++i) {
    if (bits.test(i)) {
      value += multiplier;
    }
    multiplier *= 2;
  }
  return value;
}

void printRepeat(char character, int repeat) {
  for (int i = 0; i < repeat; ++i) {
    std::cout << character;
  }
}
int main() {
  std::cout << "[";
  for (int value = 0; value < 10'000'000; ++value) {
    int valueClone = value;
    while (valueClone > 9) {
      valueClone = toDecimal(toBinary(valueClone));
    }
    // std::cout << valueClone << "\n";
    //printRepeat(' ', valueClone);
    //std::cout << "0\n";
    std::cout << valueClone << ",";
  }
  std::cout << "]";
}