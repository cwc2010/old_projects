// fluid.cpp
// Persistent, high-performance 2D fluid solver using Stable Fluids (Jos Stam).
// Binary stdin protocol:
//   'I' + uint32 N + uint32 channels + float dt + float diff + float visc
// Then repeated steps:
//   'S' + uint32 events + float dt + events*(8 floats: x y radius fx fy r g b)
// Binary stdout per step:
//   'O' + channels*(N*N float32)  [row-major interior (1..N, 1..N)]
//
// Build (Linux/macOS):
//   g++ -O3 -ffast-math -std=c++20 -o fluid fluid.cpp

#include <iostream>
#include <vector>
#include <array>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <algorithm>

static inline void die(const char* msg) {
    std::cerr << msg << '\n';
    std::exit(1);
}

struct Sim {
    int N = 0;           // interior size
    int size = 0;        // (N+2)
    int channels = 0;    // typically 3 (RGB)
    float def_dt = 1.0f / 60.0f;
    float diff = 0.0f;
    float visc = 0.0f;

    std::vector<float> u, v, u0, v0;               // velocity fields
    std::vector<std::vector<float>> dens, dens0;   // dye per channel

    void init(int n, int c, float dt, float d, float vsc) {
        N = n;
        channels = c;
        def_dt = dt;
        diff = d;
        visc = vsc;
        size = N + 2;
        const int total = size * size;

        u.assign(total, 0.0f);
        v.assign(total, 0.0f);
        u0.assign(total, 0.0f);
        v0.assign(total, 0.0f);
        dens.assign(channels, std::vector<float>(total, 0.0f));
        dens0.assign(channels, std::vector<float>(total, 0.0f));
    }

    inline int IX(int i, int j) const { return i + j * size; }

    void add_source(std::vector<float>& x, const std::vector<float>& s, float dt) {
        const int total = size * size;
        for (int i = 0; i < total; ++i) x[i] += dt * s[i];
    }

    void set_bnd(int b, std::vector<float>& x) {
        for (int i = 1; i <= N; ++i) {
            x[IX(0,    i)] = (b == 1) ? -x[IX(1,    i)] : x[IX(1,    i)];
            x[IX(N+1,  i)] = (b == 1) ? -x[IX(N,    i)] : x[IX(N,    i)];
            x[IX(i,    0)] = (b == 2) ? -x[IX(i,    1)] : x[IX(i,    1)];
            x[IX(i,  N+1)] = (b == 2) ? -x[IX(i,    N)] : x[IX(i,    N)];
        }
        x[IX(0,    0)] = 0.5f * (x[IX(1,    0)] + x[IX(0,    1)]);
        x[IX(0,  N+1)] = 0.5f * (x[IX(1,  N+1)] + x[IX(0,    N)]);
        x[IX(N+1,  0)] = 0.5f * (x[IX(N,    0)] + x[IX(N+1,  1)]);
        x[IX(N+1, N+1)] = 0.5f * (x[IX(N,  N+1)] + x[IX(N+1,  N)]);
    }

    void lin_solve(int b, std::vector<float>& x, const std::vector<float>& x0, float a, float c) {
        for (int k = 0; k < 20; ++k) {
            for (int j = 1; j <= N; ++j) {
                int row = j * size;
                for (int i = 1; i <= N; ++i) {
                    x[row + i] = (x0[row + i] + a * (x[row + i - 1] + x[row + i + 1] + x[row - size + i] + x[row + size + i])) / c;
                }
            }
            set_bnd(b, x);
        }
    }

    void diffuse(int b, std::vector<float>& x, const std::vector<float>& x0, float diff, float dt) {
        float a = dt * diff * N * N;
        lin_solve(b, x, x0, a, 1 + 4 * a);
    }

    void project(std::vector<float>& u, std::vector<float>& v, std::vector<float>& p, std::vector<float>& div) {
        for (int j = 1; j <= N; ++j) {
            int row = j * size;
            for (int i = 1; i <= N; ++i) {
                div[row + i] = -0.5f * (
                    u[row + i + 1] - u[row + i - 1] +
                    v[row + size + i] - v[row - size + i]
                ) / N;
                p[row + i] = 0.0f;
            }
        }
        set_bnd(0, div);
        set_bnd(0, p);
        lin_solve(0, p, div, 1.0f, 4.0f);
        for (int j = 1; j <= N; ++j) {
            int row = j * size;
            for (int i = 1; i <= N; ++i) {
                u[row + i] -= 0.5f * N * (p[row + i + 1] - p[row + i - 1]);
                v[row + i] -= 0.5f * N * (p[row + size + i] - p[row - size + i]);
            }
        }
        set_bnd(1, u);
        set_bnd(2, v);
    }

    void advect(int b, std::vector<float>& d, const std::vector<float>& d0, const std::vector<float>& u, const std::vector<float>& v, float dt) {
        float dt0 = dt * N;
        for (int j = 1; j <= N; ++j) {
            int row = j * size;
            for (int i = 1; i <= N; ++i) {
                float x = i - dt0 * u[row + i];
                float y = j - dt0 * v[row + i];
                if (x < 0.5f) x = 0.5f;
                if (x > N + 0.5f) x = N + 0.5f;
                int i0 = static_cast<int>(std::floor(x));
                int i1 = i0 + 1;
                if (y < 0.5f) y = 0.5f;
                if (y > N + 0.5f) y = N + 0.5f;
                int j0 = static_cast<int>(std::floor(y));
                int j1 = j0 + 1;

                float s1 = x - i0, s0 = 1.0f - s1;
                float t1 = y - j0, t0 = 1.0f - t1;

                d[row + i] =
                    s0 * (t0 * d0[IX(i0, j0)] + t1 * d0[IX(i0, j1)]) +
                    s1 * (t0 * d0[IX(i1, j0)] + t1 * d0[IX(i1, j1)]);
            }
        }
        set_bnd(b, d);
    }

    void vel_step(std::vector<float>& u, std::vector<float>& v, std::vector<float>& u0, std::vector<float>& v0, float visc, float dt) {
        add_source(u, u0, dt);
        add_source(v, v0, dt);
        std::fill(u0.begin(), u0.end(), 0.0f);
        std::fill(v0.begin(), v0.end(), 0.0f);

        std::swap(u0, u);
        diffuse(1, u, u0, visc, dt);
        std::swap(v0, v);
        diffuse(2, v, v0, visc, dt);
        std::vector<float> p(size * size, 0.0f), div(size * size, 0.0f);
        project(u, v, p, div);
        std::swap(u0, u);
        std::swap(v0, v);
        advect(1, u, u0, u0, v0, dt);
        advect(2, v, v0, u0, v0, dt);
        project(u, v, p, div);
    }

    void dens_step(std::vector<float>& x, std::vector<float>& x0, std::vector<float>& u, std::vector<float>& v, float diff, float dt) {
        add_source(x, x0, dt);
        std::fill(x0.begin(), x0.end(), 0.0f);

        std::swap(x0, x);
        diffuse(0, x, x0, diff, dt);
        std::swap(x0, x);
        advect(0, x, x0, u, v, dt);
    }

    void stamp_event(float xNorm, float yNorm, float radiusNorm, float fx, float fy, const std::array<float,3>& color) {
        // Convert normalized coords [0..1] to interior grid [1..N]
        float cx = 1.0f + xNorm * N;
        float cy = 1.0f + yNorm * N;
        float rad = std::max(1.0f, radiusNorm * N);
        float sigma2 = (rad * 0.5f) * (rad * 0.5f);

        int iMin = std::max(1, static_cast<int>(std::floor(cx - rad * 2)));
        int iMax = std::min(N, static_cast<int>(std::ceil (cx + rad * 2)));
        int jMin = std::max(1, static_cast<int>(std::floor(cy - rad * 2)));
        int jMax = std::min(N, static_cast<int>(std::ceil (cy + rad * 2)));

        for (int j = jMin; j <= jMax; ++j) {
            for (int i = iMin; i <= iMax; ++i) {
                float dx = i - cx;
                float dy = j - cy;
                float d2 = dx*dx + dy*dy;
                // Gaussian falloff
                float w = std::exp(-d2 / (2.0f * sigma2));
                int idx = IX(i, j);
                u0[idx] += fx * w;
                v0[idx] += fy * w;
                if (channels >= 1) dens0[0][idx] += color[0] * w;
                if (channels >= 2) dens0[1][idx] += color[1] * w;
                if (channels >= 3) dens0[2][idx] += color[2] * w;
            }
        }
    }
};

// Binary IO helpers using std::cin / std::cout (binary)
static bool read_exact(void* dst, std::size_t len) {
    char* p = static_cast<char*>(dst);
    std::size_t have = 0;
    while (have < len) {
        std::cin.read(p + have, static_cast<std::streamsize>(len - have));
        std::streamsize got = std::cin.gcount();
        if (got <= 0) return false;
        have += static_cast<std::size_t>(got);
    }
    return true;
}

static void write_exact(const void* src, std::size_t len) {
    const char* p = static_cast<const char*>(src);
    std::cout.write(p, static_cast<std::streamsize>(len));
    if (!std::cout) die("write failed");
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);

    static_assert(sizeof(std::uint32_t) == 4, "uint32_t must be 4 bytes for the protocol");
    static_assert(sizeof(float) == 4, "float must be 4 bytes for the protocol");

    Sim sim;

    // Expect 'I'
    {
        uint8_t tag;
        if (!read_exact(&tag, 1)) return 0;
        if (tag != static_cast<uint8_t>('I')) die("Expected init 'I'");

        std::uint32_t N = 0, C = 0;
        float dt = 1.0f/60.0f, diff = 0.0f, visc = 0.0f;
        if (!read_exact(&N, sizeof(N))) return 0;
        if (!read_exact(&C, sizeof(C))) return 0;
        if (!read_exact(&dt, sizeof(dt))) return 0;
        if (!read_exact(&diff, sizeof(diff))) return 0;
        if (!read_exact(&visc, sizeof(visc))) return 0;

        if (N < 8 || N > 1024) die("N out of range");
        if (C < 1 || C > 4) die("channels out of range");

        sim.init(static_cast<int>(N), static_cast<int>(C), dt, diff, visc);
    }

    std::vector<float> out;
    out.reserve(static_cast<std::size_t>(sim.channels) * static_cast<std::size_t>(sim.N) * static_cast<std::size_t>(sim.N));

    while (true) {
        uint8_t tag;
        if (!read_exact(&tag, 1)) break;
        if (tag != static_cast<uint8_t>('S')) die("Expected step 'S'");

        std::uint32_t eventsCount = 0;
        float dt = sim.def_dt;
        if (!read_exact(&eventsCount, sizeof(eventsCount))) break;
        if (!read_exact(&dt, sizeof(dt))) break;

        // Clear source buffers
        std::fill(sim.u0.begin(), sim.u0.end(), 0.0f);
        std::fill(sim.v0.begin(), sim.v0.end(), 0.0f);
        for (int c = 0; c < sim.channels; ++c) {
            std::fill(sim.dens0[c].begin(), sim.dens0[c].end(), 0.0f);
        }

        struct Ev { float x,y,radius,fx,fy,r,g,b; };
        static_assert(sizeof(Ev) == 8 * sizeof(float), "Ev must be tightly packed floats");

        for (std::uint32_t i = 0; i < eventsCount; ++i) {
            Ev ev;
            if (!read_exact(&ev, sizeof(ev))) return 0;
            std::array<float,3> col = { ev.r, ev.g, ev.b };
            float xClamped = std::clamp(ev.x, 0.0f, 1.0f);
            float yClamped = std::clamp(ev.y, 0.0f, 1.0f);
            float rClamped = std::clamp(ev.radius, 0.0005f, 0.8f);
            sim.stamp_event(xClamped, yClamped, rClamped, ev.fx, ev.fy, col);
        }

        // Step simulation
        sim.vel_step(sim.u, sim.v, sim.u0, sim.v0, sim.visc, dt);
        for (int c = 0; c < sim.channels; ++c) {
            sim.dens_step(sim.dens[c], sim.dens0[c], sim.u, sim.v, sim.diff, dt);
        }

        // Write out: 'O' + channels*(N*N floats) in row-major interior (1..N, 1..N)
        const int area = sim.N * sim.N;
        out.assign(static_cast<std::size_t>(sim.channels) * static_cast<std::size_t>(area), 0.0f);

        int idxInterior = 0;
        for (int j = 1; j <= sim.N; ++j) {
            for (int i = 1; i <= sim.N; ++i) {
                int idx = sim.IX(i, j);
                for (int c = 0; c < sim.channels; ++c) {
                    out[static_cast<std::size_t>(c) * static_cast<std::size_t>(area) + static_cast<std::size_t>(idxInterior)] =
                        std::max(0.0f, sim.dens[c][idx]);
                }
                ++idxInterior;
            }
        }

        char header = 'O';
        write_exact(&header, 1);
        if (!out.empty()) {
            write_exact(out.data(), out.size() * sizeof(float));
        }
        std::cout.flush();
    }

    return 0;
}
