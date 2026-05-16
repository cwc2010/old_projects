#include <iostream>
#include <array>
#include <iomanip>

long double twoDiceProbability (int number) {
  if (number < 8) {
    return number/36.0;
  }
  return (14-number)/36.0;
}
void calculateBoard(int index, int count, std::array<long double, 40>& map) {
  for (int i = 2; i < 13; ++i) {
    int newIndex = (index+i)%(static_cast<int>(map.size()));
    if (count == 1) {
      long double chanceA = map[newIndex];
      long double chanceB = twoDiceProbability(i);
      map[newIndex] = chanceA + chanceB - (chanceA*chanceB);
    }
    if (count > 0) {
      calculateBoard(newIndex, count - 1, map);
    }
  }
}
int main(int argc, char *argv[]) {
  std::array<long double, 40> map {};
  for (int i = 0; i < 40; ++i) {
    map[i] = 0;
  }
  calculateBoard(std::stoi(argv[1]), std::stoi(argv[2]), map);
  std::cout << std::setprecision(20);
  for (long double i : map) {
    std::cout << i << "\n";
  }
  return 0;
}