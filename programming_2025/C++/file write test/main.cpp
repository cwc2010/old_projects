#include <iostream>
#include <fstream>
#include <cassert>

int main() {
  std::ofstream file {"output.text"};
  if (!file) {
  	std::cout << "could not open file";
  	return 1;
  }
  file << "test\n";
}