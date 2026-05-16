#include <iostream>
#include <array>

template <typename T, auto N>
void printArray (const std::array<T,N>& array) {
  for (const auto& value : array) {
    std::cout << value << ",";
  }
}
struct Point3d {
  int x;
  int y;
  int z;
};
int main() {
  std::array<Point3d, 3> triangle {{
    {0,1,2},
    {3,4,5},
    {6,7,8},
  }};

  for (Point3d point : triangle) {
    std::cout << "(" << point.x << "," << point.y << "," << point.z << "),\n";
  }
  std::array<int, 6>  pi {3,1,4,1,5,9};
  printArray(pi);
  return 0;
}