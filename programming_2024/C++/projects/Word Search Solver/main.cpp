#include <iostream>
#include <fstream>
#include <vector>
#include "wordsearchsolver.h"
struct ANSI {
  std::string black = "\e[0;30m";
  std::string red = "\e[0;31m";
  std::string green = "\e[0;32m";
  std::string blue = "\e[0;34m";
  std::string white = "\e[0;37m";
  std::string reset = "\e[0m";
};

void printError(std::string_view msg) {
  std::cerr << "\e[0;31m" << msg << "\e[0m";
}
int main() {
  ANSI colors{};
  std::cout << "Directory: " << std::filesystem::current_path() << "\n";
  std::ifstream boardInputFile {"./board.txt"};
  if (!boardInputFile) {
    printError("Error reading board.txt\n");
    return 1;
  }
  std::ifstream searchInputFile {"./search.txt"};
  if (!searchInputFile) {
    printError("Error reading search.txt\n");
    return 1;
  }
  std::string currentLine {""};
  std::vector<std::string> toFind{};
  while (std::getline(searchInputFile,currentLine)) {
    toFind.push_back(currentLine);
  }


  std::vector<std::string> letters{};
  letters.reserve(10);

  int lineNumber = 0;
  while (std::getline(boardInputFile,currentLine)) {
    if (letters.size() == letters.capacity()) {
      letters.reserve(static_cast<int>(letters.size())+10);
      std::cout << "Reserved space. Size: " << letters.size() << " Capacity: " << letters.capacity() << "\n";
    }

    letters.push_back(currentLine);
    ++lineNumber;
  }


  std::cout << colors.green << "WORDS TO FIND: \n";
  for (auto& line : toFind) {
    std::cout << line << "\n";
  }
  std::cout << colors.reset << "\nBoard: \n\n";
  for (auto line : letters) {
    std::cout << line << "\n";
  }



  return 0;
}