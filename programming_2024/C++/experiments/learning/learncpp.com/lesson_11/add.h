#ifndef header_198723651872365918
#define header_198723651872365918

template <typename T, typename U>

auto add(T x, U y) {
  return x + y;
}

// c++20
auto add(auto x, auto y, auto z) {
  return x + y + z;
}

#endif