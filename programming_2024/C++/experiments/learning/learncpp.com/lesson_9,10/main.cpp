#include <iostream>
#include <cassert>
#include "constants.h"
#include <typeinfo>

int main () {
	auto doubleType = 5.0;
	std::cout << typeid(doubleType).name() << " " << doubleType << "\n";

	using Decimal = double;

	Decimal doubleTest = 123.456;
	std::cout << doubleTest << "\n";

	namespace co = constants;
	std::cout << typeid(co::sInt + co::floatValue).name() << "\n";
	std::cout << typeid(co::sShort + co::sShort).name() << "\n";
	std::cout << typeid(co::uInt - 2*co::sInt).name() << "\n";

	constexpr int signedInt = 5;
	unsigned int unsignedInt = signedInt;
	std::cout << unsignedInt << "\n";
	int number = -5;
	std::cout << static_cast<int>(static_cast<unsigned int>(number)) << "\n";
  static_assert(true, "assertion failed");	
	int option;
  std::cout << "Option: ";
  std::cin >> option;
  switch (option) {
  case 0:
    assert(true);
    break;
  case 2:
    assert(false);
    break;
  case 3:
    assert(false && "assertion failed");
    break;
  }

	bool exit = false;
	std::cout << "Exit? ";
	std::cin >> exit;
	if (exit) {
		std::exit(1);
	}
	bool abort = false;
	std::cout << "Abort? ";
	std::cin >> abort;
	if (abort) {
		std::abort();
	}
	return 0;
}