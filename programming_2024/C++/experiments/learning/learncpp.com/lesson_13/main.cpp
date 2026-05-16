#include <iostream>
#include <cmath>
#include <utility>

enum class Letter {
  a,
  b,
  c,
  d,
  e,
};

std::ostream& operator << (std::ostream& cout, Letter letter) {
  std::string letterName;
  switch (letter) {
  case Letter::a:
    letterName = "a";
    break;
  case Letter::b:
    letterName = "b";
    break;
  case Letter::c:
    letterName = "c";
    break;
  case Letter::d:
    letterName = "d";
    break;
  case Letter::e:
    letterName = "e";
    break;
  }
  cout << letterName;
  return cout;
}

struct Point3d {
  double x = 0;
  double y = 0;
  double z = 0;
};

struct Line {
  Point3d point1 {0,0,0};
  Point3d point2 {0,0,0};
};

Point3d flipPoint3d (const Point3d& point) {
  return Point3d {-point.x, -point.y, -point.z};
}

double get3dLineDistance(const Line& line) {
  double xdistance2 = line.point1.x - line.point2.x;
  xdistance2 *= xdistance2;
  double ydistance2 = line.point1.y - line.point2.y;
  ydistance2 *= ydistance2;
  double zdistance2 = line.point1.z - line.point2.z;
  zdistance2 *= zdistance2;
  return std::sqrt(xdistance2+ydistance2+zdistance2);
}

template <typename T, typename U>
struct Point2d {
  T x = 0;
  U y = 0;
};

void printPoint(const Point3d& point) {
  std::cout << point.x << ", " << point.y << ", " << point.z << "\n";
}

int distance2d(std::pair<double,double> a, std::pair<double,double> b) {
  double firstDistance2 = a.first - b.first;
  firstDistance2 *= firstDistance2;
  double secondDistance2 = a.second - b.second;
  secondDistance2 *= secondDistance2;
  return std::sqrt(firstDistance2+secondDistance2);
}

int main() {
  std::pair<double,double> point1_2d = {0,0};
  std::pair point2_2d = {1,1};
  std::cout << distance2d(point1_2d, point2_2d) << "\n";


  Point3d point1 = {10, 10, 10};
  printPoint(point1);
  Point3d point2 = flipPoint3d(point1);
  printPoint(point2);
  Line line {.point1 = point1, .point2 = point2};
  Point3d* point1ptr = &point1;
  Line* lineptr = &line;
  std::cout << "x coordinate of point 1: " << point1ptr->x << "\n";
  std::cout << "x coordinate of point 2: " << (lineptr->point2).x << "\n";
  std::cout << get3dLineDistance(line) << "\n";
  Letter letter = Letter::c;
  std::cout << "letter: " << letter << "\n";
  return 0;
}