#include <iostream>

class Test {
public: 
  Test () = default;
  Test (int val, std::string_view name) : m_val{val}, m_name{name} {
    std::cout << "Constructed " << val << ", " << name << "\n";
  }
  explicit Test (std::string_view name) : Test{0,name} {}
  void test_const () {
    std::cout << "non-const\n";
  }
  void test_const () const {
    std::cout << "const\n";
  }
  void setPrivate (int val) {
    m_val = val;
  }
  void setName (std::string_view name) {
    m_name = name;
  }
  std::string& name() {
    return m_name;
  }
  int getPrivate (Test& test) const {
    return test.m_val;
  }
private:
  int m_val {5};
  std::string m_name {"default"};
};
class CopyElisionTest {
public:
  explicit CopyElisionTest (int x) : m_x{x} {
    std::cout << "Constructed CopyElisionTest " << x << "\n";
  }
  CopyElisionTest (CopyElisionTest& x): CopyElisionTest(x.m_x) {
    std::cout << "Copied CopyElisionTest\n";
  }
private:
  int m_x = 0;
};
class Pair {
public:
  constexpr Pair (int first, int second) : m_first{first}, m_second{second} {}
  constexpr int max() const {
    return (m_first > m_second) ? m_first : m_second;
  }
private:
  int m_first{};
  int m_second{};
};
int main() {
  [[maybe_unused]] CopyElisionTest copyElisionTest {CopyElisionTest {0}};
  Test test1 {"test"};
  Test test1Copy {test1}; // copy constructor
  test1.test_const();

  std::cout << "\n----------\n";
  
  std::cout << test1.name() << "\n";
  const Test test2;
  test2.test_const();
  std::cout << test1.getPrivate(test1) << "\n";
  test1.setPrivate(10);
  std::cout << test2.getPrivate(test1) << "\n";
  return 0;
}