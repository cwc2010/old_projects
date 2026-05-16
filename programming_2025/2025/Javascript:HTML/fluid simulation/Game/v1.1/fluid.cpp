// sim.cpp
#include <iostream>
#include <vector>
#include <cmath>
#include <algorithm>
#include <string>
#include <sstream>
#include "json.hpp"  // Download from https://github.com/nlohmann/json/releases

using json = nlohmann::json;
using farray = std::vector<float>;

inline int idx(int x, int y, int N) {
    return x + y * N;
}

void diffuse(const farray &prev, farray &curr,
             float diff, float dt, int iters, int N)
{
    if (diff == 0.0f) {
        curr = prev;
        return;
    }
    float a = diff * dt;
    curr = prev;  // initialize

    for (int it = 0; it < iters; ++it) {
        for (int y = 1; y < N - 1; ++y) {
            for (int x = 1; x < N - 1; ++x) {
                int i = idx(x, y, N);
                curr[i] = (prev[i]
                    + a * (curr[idx(x-1,y,N)] + curr[idx(x+1,y,N)]
                         + curr[idx(x,y-1,N)] + curr[idx(x,y+1,N)]))
                    / (1.0f + 4.0f * a);
            }
        }
    }
}

float bilinearSample(const farray &F, float x, float y, int N) {
    x = std::clamp(x, 0.5f, static_cast<float>(N - 1.5f));
    y = std::clamp(y, 0.5f, static_cast<float>(N - 1.5f));
    int i0 = static_cast<int>(std::floor(x));
    int j0 = static_cast<int>(std::floor(y));
    int i1 = i0 + 1;
    int j1 = j0 + 1;
    float sx = x - i0;
    float sy = y - j0;

    float f00 = F[idx(i0, j0, N)], f10 = F[idx(i1, j0, N)];
    float f01 = F[idx(i0, j1, N)], f11 = F[idx(i1, j1, N)];
    float ix0 = f00 * (1 - sx) + f10 * sx;
    float ix1 = f01 * (1 - sx) + f11 * sx;
    return ix0 * (1 - sy) + ix1 * sy;
}

void advect(const farray &prevField, farray &currField,
            const farray &velX, const farray &velY,
            float dt, int N)
{
    for (int y = 1; y < N - 1; ++y) {
        for (int x = 1; x < N - 1; ++x) {
            int i = idx(x, y, N);
            float bx = x - dt * velX[i];
            float by = y - dt * velY[i];
            currField[i] = bilinearSample(prevField, bx, by, N);
        }
    }
}

void project(farray &velX, farray &velY,
             farray &pressure, farray &divergence,
             int iters, int N)
{
    // compute divergence & zero pressure
    for (int y = 1; y < N - 1; ++y) {
        for (int x = 1; x < N - 1; ++x) {
            int i = idx(x, y, N);
            divergence[i] = -0.5f * (
                velX[i + 1] - velX[i - 1] +
                velY[i + N] - velY[i - N]
            );
            pressure[i] = 0.0f;
        }
    }

    // solve Poisson for pressure
    for (int it = 0; it < iters; ++it) {
        for (int y = 1; y < N - 1; ++y) {
            for (int x = 1; x < N - 1; ++x) {
                int i = idx(x, y, N);
                pressure[i] = 0.25f * (
                    divergence[i]
                    + pressure[i - 1] + pressure[i + 1]
                    + pressure[i - N] + pressure[i + N]
                );
            }
        }
    }

    // subtract gradient
    for (int y = 1; y < N - 1; ++y) {
        for (int x = 1; x < N - 1; ++x) {
            int i = idx(x, y, N);
            velX[i] -= 0.5f * (pressure[i + 1] - pressure[i - 1]);
            velY[i] -= 0.5f * (pressure[i + N] - pressure[i - N]);
        }
    }
}

int main() {
    std::string line;
    if (!std::getline(std::cin, line) || line.empty()) return 0;

    json in = json::parse(line);
    int    N       = in["gridSize"];
    float  dt      = in["timeStep"];
    float  visc    = in["viscosity"];
    float  diffD   = in["densityDiffusion"];
    int    iters   = in["solverIterations"];
    farray velX    = in["velX"].get<farray>();
    farray velY    = in["velY"].get<farray>();
    farray density = in["density"].get<farray>();

    // allocate buffers
    farray vx0(N * N), vy0(N * N), p(N * N), divf(N * N);
    farray dens0(N * N), velX1(N * N), velY1(N * N), density1(N * N);

    // velocity diffusion & project
    diffuse(velX, vx0, visc, dt, iters, N);
    diffuse(velY, vy0, visc, dt, iters, N);
    project(vx0, vy0, p, divf, iters, N);

    // velocity advection & project
    diffuse(vx0, velX1, 0.0f, dt, 1, N); // copy vx0 → velX1
    diffuse(vy0, velY1, 0.0f, dt, 1, N);
    advect(vx0, velX1, vx0, vy0, dt, N);
    advect(vy0, velY1, vx0, vy0, dt, N);
    project(velX1, velY1, p, divf, iters, N);

    // density diffusion & advection
    diffuse(density, dens0, diffD, dt, iters, N);
    advect(dens0, density1, velX1, velY1, dt, N);

    // output
    json out = {
        {"newVelX", velX1},
        {"newVelY", velY1},
        {"newDensity", density1}
    };
    std::cout << out.dump() << std::endl;
    return 0;
}
