#include <iostream>

int main() {
	std::string text;
	std::cout << "Input: ";
	std::getline(std::cin >> std::ws, text);
	std::cout << "\n" << text << "\n";
	std::cout << "Length: " << text.length() << "\n";


	constexpr int kNum1 = 10;
	constexpr int kNum2 = 5;
	const int kGreater = (kNum1 > kNum2) ? kNum1 : kNum2;
	std::cout << "Greater: " << kGreater << "\n";
	std::cout << "static_cast: " << std::to_string(1234) << "\n";
	constexpr int kConstant = 1234;
	std::cout << "Constant: " << kConstant << "\n";
	constexpr double kGravity = 9.8;
	return 0;
}