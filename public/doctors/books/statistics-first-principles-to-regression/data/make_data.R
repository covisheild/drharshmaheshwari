# make_data.R -- canonical SYNTHETIC teaching data for
# "Statistics: From First Principles to Regression" v3.0 (Dr Harsh Maheshwari).
#
# All data are synthetic teaching data; they describe no real persons, households,
# villages or districts. Every section has its own seed, so changing one dataset
# never changes another.
#
# Run from the repository root:   Rscript data/make_data.R
# Then compute the registry:       Rscript data/compute_numbers.R
#
# Several datasets are "engineered": the data are built so that a named model
# reproduces the book's printed numbers. For OLS this is exact by construction
# (y = X b + e with e orthogonal to X, rescaled to the target residual sum of
# squares), followed by rounding to the recording precision and a small greedy
# repair so the rounded data still give the target values. For logistic and Cox
# models, outcomes are simulated from the target model and then nudged by a
# greedy search; the achieved values are reported by compute_numbers.R.

suppressPackageStartupMessages({ library(survival) })
OUT <- "data"
if (!dir.exists(OUT)) stop("Run from the repository root (data/ not found).")
wcsv <- function(d, f) write.csv(d, file.path(OUT, f), row.names = FALSE, na = "")

# ---------------------------------------------------------------- helpers ----
# Build y so that OLS of y on X gives exactly `beta`, with residual SS = `sse`.
# Rows in `fixed_idx` get the prescribed residuals `fixed_e`.
engineer_ols <- function(X, beta, sse, seed, fixed_idx = integer(0), fixed_e = numeric(0)) {
  n <- nrow(X); free <- setdiff(seq_len(n), fixed_idx)
  e <- numeric(n); e[fixed_idx] <- fixed_e
  Xf <- X[free, , drop = FALSE]
  rhs <- if (length(fixed_idx)) -crossprod(X[fixed_idx, , drop = FALSE], fixed_e) else matrix(0, ncol(X), 1)
  c0 <- Xf %*% solve(crossprod(Xf), rhs)                       # meets X'e = 0
  set.seed(seed); z <- rnorm(length(free))
  z <- z - Xf %*% solve(crossprod(Xf), crossprod(Xf, z))       # orthogonal to X
  rem <- sse - sum(fixed_e^2) - sum(c0^2)
  if (rem <= 0) stop("engineer_ols: fixed residuals exceed the SSE budget")
  e[free] <- c0 + z * sqrt(rem / sum(z^2))
  drop(X %*% beta + e)
}

# Greedy repair after rounding: nudge single values by +/- step (never the rows in
# `lock`) while the loss decreases. `lossf(y)` returns a non-negative number.
greedy_round <- function(y, lossf, lock = integer(0), step = 0.1, seed = 1,
                         tol = 0, maxit = 20000, lo = -Inf, hi = Inf) {
  set.seed(seed); cand <- setdiff(seq_along(y), lock); L <- lossf(y); it <- 0
  while (L > tol && it < maxit) {
    it <- it + 1; i <- sample(cand, 1); s <- sample(c(-step, step), 1)
    y2 <- y; y2[i] <- round(y2[i] + s, 10)
    if (y2[i] < lo || y2[i] > hi) next
    L2 <- lossf(y2); if (L2 < L) { y <- y2; L <- L2 }
  }
  attr(y, "loss") <- L; attr(y, "iter") <- it; y
}

# ============================================================================
# 1. clinic_children.csv -- the under-five clinic register (Ch 1-4, 11-12)
#    100 children aged 12-36 months. Rows 1-30 are "today's" 30 children
#    (arrival order 1-30) whose weights give the Ch 1 frequency table
#    8-<10: 5, 10-<12: 12, 12-<14: 9, 14-<16: 4 and start 11.2, 9.8, 14.1,
#    10.0, 12.3, 13.6 as in Ch 1. Simple OLS of weight on age over all 100:
#    b0 = 8.500, b1 = 0.150 kg/month, r = 0.820 (R^2 = 0.672).
# ============================================================================
set.seed(101)
today_w <- c(11.2, 9.8, 14.1, 10.0, 12.3, 13.6,          # the six quoted in Ch 1
             8.6, 9.1, 9.4, 9.7,                          # 8-<10  (with 9.8: 5)
             10.3, 10.5, 10.8, 11.0, 11.1, 11.4, 11.5, 11.6, 11.8, 11.9,  # 10-<12 (+11.2, 10.0: 12)
             12.0, 12.4, 12.6, 12.9, 13.1, 13.4, 13.8,    # 12-<14 (+12.3, 13.6: 9)
             14.4, 14.8, 15.3)                            # 14-<16 (+14.1: 4)
ord <- c(1:6, sample(7:30))                               # shuffle arrival order of the rest
today_w <- today_w[ord]
today_age <- pmin(36, pmax(12, round((today_w - 8.5) / 0.15 + rnorm(30, 0, 6))))
n_cl <- 100
other_age <- sample(12:36, n_cl - 30, replace = TRUE)
age <- c(today_age, other_age)
# row 31 is the 18-month-old weighing 11.8 kg used in Ch 12 (residual +0.6 kg)
age[31] <- 18
X <- cbind(1, age); b <- c(8.5, 0.15)
Sxx <- sum((age - mean(age))^2); SSR <- b[2]^2 * Sxx
SSE <- SSR * (1 - 0.82^2) / 0.82^2
fixed <- c(1:30, 31)
fe <- c(today_w - (8.5 + 0.15 * today_age), 11.8 - (8.5 + 0.15 * 18))
w <- engineer_ols(X, b, SSE, seed = 102, fixed_idx = fixed, fixed_e = fe)
w <- round(w, 1)
clinic_loss <- function(y) {
  f <- lm.fit(X, y)$coefficients; r <- cor(age, y)
  max(0, abs(f[1] - 8.5) - 4e-4) * 10 + max(0, abs(f[2] - 0.15) - 4e-5) * 1000 +
    max(0, abs(r - 0.82) - 4e-4) * 100
}
w <- greedy_round(w, clinic_loss, lock = fixed, step = 0.1, seed = 103, lo = 7.5, hi = 16.5)
stopifnot(attr(w, "loss") == 0)
w <- as.numeric(w)
res <- w - (8.5 + 0.15 * age)
# sex, nutritional status (60 normal / 25 moderate / 15 severe, lowest residuals wasted)
set.seed(104)
sex <- sample(rep(c("M", "F"), each = 50))
score <- res + rnorm(n_cl, 0, 0.25)
rk <- rank(score, ties.method = "first")
nut <- ifelse(rk <= 15, "severe wasting", ifelse(rk <= 40, "moderate wasting", "normal"))
# height (cm): WHO-like growth, correlated with weight
height <- round(69 + 0.75 * age + 2.2 * res + rnorm(n_cl, 0, 1.6), 1)
wealth_q <- pmin(5, pmax(1, round(3 + 1.1 * res + rnorm(n_cl, 0, 1.1))))
mat_edu <- cut(0.6 * (wealth_q - 3) + rnorm(n_cl), c(-Inf, -0.6, 0.5, Inf),
               labels = c("none", "primary", "secondary+"))
diarr <- rpois(n_cl, exp(-0.45 - 0.35 * res + 0.4 * (nut != "normal")))
diarr <- pmin(diarr, 4)
clinic <- data.frame(
  child_id = sprintf("C%03d", 1:n_cl),
  seen_today = as.integer(seq_len(n_cl) <= 30),
  arrival_order = c(1:30, rep(NA, 70)),
  age_months = age, sex = sex, weight_kg = w, height_cm = height,
  nutritional_status = nut,
  diarrhoea_episodes_month = diarr,
  wealth_quintile = wealth_q, maternal_education = as.character(mat_edu))
wcsv(clinic, "clinic_children.csv")

# ============================================================================
# 2. journey_mlr.csv -- Analysis Journey 12.6: 240 children, 3 missing wealth.
#    OLS weight ~ wealth + age + female on the 237 complete cases gives
#    exactly 0.62, 0.18, -0.25; design tuned for the v2.2 CIs, p = 0.14,
#    adjusted R^2 = 0.41 and crude wealth coefficient 0.90.
# ============================================================================
set.seed(201)
n_m <- 240
age_m <- pmin(36, pmax(12, round(rnorm(n_m, 24, 5.2))))
female <- sample(rep(0:1, c(122, 118)))
miss <- sort(sample(n_m, 3))
cc <- setdiff(seq_len(n_m), miss)
# wealth = alpha*(age - mean) + noise orthogonal to (1, age, female) on complete cases
u <- rnorm(n_m)
A <- cbind(1, age_m, female)[cc, ]
u_cc <- u[cc] - A %*% solve(crossprod(A), crossprod(A, u[cc])); u_cc <- u_cc / sd(u_cc)
bM <- c(7.30, 0.62, 0.18, -0.25)
mlr_stats <- function(p) {        # p = (alpha, s_u, sigma)
  wl <- p[1] * (age_m[cc] - mean(age_m[cc])) + p[2] * u_cc
  Xm <- cbind(1, wl, age_m[cc], female[cc]); nn <- nrow(Xm)
  XtXi <- solve(crossprod(Xm)); se <- p[3] * sqrt(diag(XtXi))
  fitted <- Xm %*% bM; sst <- sum((fitted - mean(fitted))^2) + p[3]^2 * (nn - 4)
  r2 <- 1 - p[3]^2 * (nn - 4) / sst; adj <- 1 - (1 - r2) * (nn - 1) / (nn - 4)
  crude <- cov(fitted, wl) / var(wl)
  vif_w <- 1 / (1 - summary(lm(wl ~ age_m[cc] + female[cc]))$r.squared)
  c(se_w = se[2], se_a = se[3], se_f = se[4], adj = adj, crude = crude, vif = vif_w)
}
tgt <- c(se_w = 0.31 / 1.9702, se_a = 0.03 / 1.9702, se_f = 0.33 / 1.9702,
         adj = 0.41, crude = 0.90, vif = 1.2)
wt <- c(se_w = 50, se_a = 5, se_f = 50, adj = 50, crude = 50, vif = 0.2)
mlr_obj <- function(p) { s <- mlr_stats(p); sum(wt * ((s - tgt) / tgt)^2) }
opt <- optim(c(0.02, 0.55, 1.28), mlr_obj, control = list(maxit = 5000, reltol = 1e-12))
p_m <- opt$par
wealth <- numeric(n_m)
wealth[cc] <- p_m[1] * (age_m[cc] - mean(age_m[cc])) + p_m[2] * u_cc
wealth[miss] <- rnorm(3, 0, p_m[2])
wealth <- round(wealth, 2)
Xm <- cbind(1, wealth[cc], age_m[cc], female[cc])
# one low-wealth, very heavy child (large residual, low leverage) -- Ch 12.6 diagnostics
out_row <- which(cc == cc[order(wealth[cc])][80])
sse_m <- p_m[3]^2 * (length(cc) - 4)
y_cc <- engineer_ols(Xm, bM, sse_m, seed = 202, fixed_idx = out_row, fixed_e = 3.7 * p_m[3])
y_cc <- round(y_cc, 1)
mlr_loss <- function(y) {
  f <- lm.fit(Xm, y); co <- f$coefficients
  s <- sqrt(sum(f$residuals^2) / (length(y) - 4)); se <- s * sqrt(diag(solve(crossprod(Xm))))
  tq <- qt(0.975, length(y) - 4)
  lo <- round(co - tq * se, 2); hi <- round(co + tq * se, 2)
  pf <- round(2 * pt(-abs(co[4] / se[4]), length(y) - 4), 2)
  ss_t <- sum((y - mean(y))^2); adj <- 1 - (sum(f$residuals^2) / (length(y) - 4)) / (ss_t / (length(y) - 1))
  crude <- coef(lm.fit(cbind(1, Xm[, 2]), y))[2]
  sum(abs(round(co[2:4], 2) - c(0.62, 0.18, -0.25))) * 10 +
    abs(co[2] - 0.62) + abs(co[3] - 0.18) * 10 + abs(co[4] + 0.25) +
    (lo[2] != 0.31) + (hi[2] != 0.93) + (lo[3] != 0.15) + (hi[3] != 0.21) +
    (lo[4] != -0.58) + (hi[4] != 0.08) + (pf != 0.14) +
    (round(adj, 2) != 0.41) + (round(crude, 2) != 0.90) +
    20 * max(0, abs(se[4] - 0.1685) - 0.001)
}
y_cc <- greedy_round(y_cc, mlr_loss, lock = out_row, seed = 203, maxit = 30000, tol = 0)
cat("mlr greedy loss:", attr(y_cc, "loss"), "\n")
weight_m <- numeric(n_m); weight_m[cc] <- as.numeric(y_cc)
set.seed(204)
weight_m[miss] <- round(bM[1] + 0.18 * age_m[miss] - 0.25 * female[miss] + rnorm(3, 0, p_m[3]), 1)
mlr <- data.frame(child_id = sprintf("J%03d", 1:n_m), age_months = age_m,
                  sex = ifelse(female == 1, "F", "M"), wealth_index = wealth, weight_kg = weight_m)
mlr$wealth_index[miss] <- NA
wcsv(mlr, "journey_mlr.csv")

# ============================================================================
# 3. cbhi_survey.csv -- CBHI household survey: 20 villages x 25 households.
#    Logistic model of 13.3 (member ~ distance + wealth + education) tuned
#    towards the v2.2 ORs 0.91 / 1.34 / 1.29 / 1.87 and crude distance OR 0.85;
#    membership prevalence fixed at 150/500 = 30%; village ICC for membership
#    tuned to about 0.06.
# ============================================================================
set.seed(301)
n_v <- 20; m_v <- 25; n_h <- n_v * m_v
vill <- rep(sprintf("V%02d", 1:n_v), each = m_v)
d_v <- round(runif(n_v, 1, 13), 1)
dist <- pmax(0.2, round(rep(d_v, each = m_v) + rnorm(n_h, 0, 1.2), 1))
dist[sample(which(rep(d_v, each = m_v) < 4), 3)] <- 0         # three "0 km" households
zw_v <- rnorm(n_v, 0, 0.45); zw_h <- rnorm(n_h, 0, 1.65); z_lat <- rnorm(n_h)
u_v <- rnorm(n_v, 0, 0.50)
bL <- c(log(0.91), log(1.34), log(1.29), log(1.87))
# Build the covariate design for a given distance-wealth gradient g and education
# cut-points q. pfix = the target model's expected outcomes WITHOUT village effects
# (what a fixed-effects logistic fit must reproduce); pstar adds village effects
# (used only to draw the starting outcomes, and so creating the village ICC).
make_design <- function(g, q = c(0.36, 0.70)) {
  w_v <- -g * (d_v - 7) + zw_v
  wealth_h <- round(rep(w_v, each = m_v) + zw_h, 2)
  lat <- 0.25 * wealth_h - 0.06 * dist + z_lat
  edu <- cut(lat, quantile(lat, c(0, q, 1)), include.lowest = TRUE,
             labels = c("none", "primary", "secondary+"))
  Xl <- cbind(dist, wealth_h, edu == "primary", edu == "secondary+")
  eta <- drop(Xl %*% bL); eta_u <- eta + rep(u_v, each = m_v)
  b0 <- uniroot(function(b) sum(plogis(b + eta)) - 150, c(-8, 6))$root
  b0u <- uniroot(function(b) sum(plogis(b + eta_u)) - 150, c(-8, 6))$root
  list(wealth_h = wealth_h, edu = edu, Xl = Xl, pfix = plogis(b0 + eta), pstar = plogis(b0u + eta_u))
}
# crude distance OR implied by the target model (fit to its expected outcomes)
implied_crude <- function(g, q) {
  D <- make_design(g, q)
  exp(coef(suppressWarnings(glm(D$pfix ~ dist, family = quasibinomial())))[2])
}
# lattice check: member counts in the education groups are integers, so the
# targets are reachable only if the expected counts sit close to whole numbers
# (after the continuous distance/wealth sums absorb what they can).
lattice_err <- function(D) {
  Xf <- cbind(1, D$Xl); H <- crossprod(Xf, Xf * D$pfix * (1 - D$pfix)); M <- solve(H)[2:5, 2:5]
  Tt <- drop(crossprod(Xf, D$pfix))[4:5]
  best <- Inf
  for (a in c(floor(Tt[1]), ceiling(Tt[1]))) for (b in c(floor(Tt[2]), ceiling(Tt[2]))) {
    g34 <- c(a, b) - Tt
    e34 <- (M[3:4, 3:4] - M[3:4, 1:2] %*% solve(M[1:2, 1:2], M[1:2, 3:4])) %*% g34
    best <- min(best, sum(abs(e34)))
  }
  best
}
grid <- expand.grid(q1 = seq(0.32, 0.38, 0.005), q2 = seq(0.66, 0.72, 0.005))
grid$g <- NA; grid$err <- NA
for (r in seq_len(nrow(grid))) {
  q <- c(grid$q1[r], grid$q2[r])
  grid$g[r] <- uniroot(function(g) implied_crude(g, q) - 0.85, c(0, 0.8))$root
  grid$err[r] <- lattice_err(make_design(grid$g[r], q))
}
gb <- grid[which.min(grid$err), ]; g_opt <- gb$g; q_opt <- c(gb$q1, gb$q2)
D <- make_design(g_opt, q_opt); wealth_h <- D$wealth_h; edu <- D$edu; Xl <- D$Xl
pstar <- D$pstar; pfix <- D$pfix
Xf <- cbind(1, Xl); Wt <- pfix * (1 - pfix)
Ainv <- solve(crossprod(Xf, Xf * Wt)); Tsum <- drop(crossprod(Xf, pfix))
# crude model target sums
ac <- uniroot(function(a) sum(plogis(a + log(0.85) * dist)) - 150, c(-8, 6))$root
pc <- plogis(ac + log(0.85) * dist); Xc1 <- cbind(1, dist)
Acinv <- solve(crossprod(Xc1, Xc1 * pc * (1 - pc))); Tc <- drop(crossprod(Xc1, pc))
vid <- as.integer(factor(vill))
icc_sums <- function(vs) {                   # ANOVA ICC from village sums (binary y, m = 25)
  n <- n_h; k <- n_v; m <- m_v; tot <- sum(vs); ybar <- tot / n
  msb <- m * sum((vs / m - ybar)^2) / (k - 1); msw <- (tot - sum(vs^2) / m) / (n - k)
  (msb - msw) / (msb + (m - 1) * msw)
}
fast_obj <- function(S, vs) {                # one-step approximation to the fitted coefficients
  e <- drop(Ainv %*% (S - Tsum))[-1]
  ec <- drop(Acinv %*% (S[1:2] - Tc))[2]
  sum((e / 0.002)^2) + (ec / 0.002)^2 + (max(0, abs(icc_sums(vs) - 0.06) - 0.01) / 0.004)^2
}
fast_match <- function(seed) {
  set.seed(seed)
  member <- rbinom(n_h, 1, pstar); k <- sum(member) - 150
  if (k > 0) member[sample(which(member == 1), k)] <- 0
  if (k < 0) member[sample(which(member == 0), -k)] <- 1
  S <- drop(crossprod(Xf, member)); vs <- tabulate(vid[member == 1], n_v)
  J <- fast_obj(S, vs); stall <- 0
  while (stall < 60) {                          # best-of-200 random swaps per step
    I <- sample(which(member == 1), 200, TRUE); Jj <- sample(which(member == 0), 200, TRUE)
    Js <- sapply(seq_along(I), function(t) {
      S2 <- S - Xf[I[t], ] + Xf[Jj[t], ]; v2 <- vs; v2[vid[I[t]]] <- v2[vid[I[t]]] - 1
      v2[vid[Jj[t]]] <- v2[vid[Jj[t]]] + 1; fast_obj(S2, v2) })
    t <- which.min(Js)
    if (Js[t] < J) {
      member[I[t]] <- 0; member[Jj[t]] <- 1; S <- S - Xf[I[t], ] + Xf[Jj[t], ]
      vs[vid[I[t]]] <- vs[vid[I[t]]] - 1; vs[vid[Jj[t]]] <- vs[vid[Jj[t]]] + 1; J <- Js[t]; stall <- 0
    } else stall <- stall + 1
  }
  member
}
# final polish on the exact fits (plain greedy swaps)
icc_anova <- function(y, g) icc_sums(tabulate(as.integer(factor(g))[y == 1], n_v))
logit_loss <- function(y) {
  lor <- suppressWarnings(glm.fit(Xf, y, family = binomial()))$coefficients[-1]
  cr <- glm.fit(Xc1, y, family = binomial())$coefficients[2]
  sum(abs(exp(lor) - c(0.91, 1.34, 1.29, 1.87)) > 0.004) + (abs(exp(cr) - 0.85) > 0.004) +
    sum(abs(lor - bL)) + abs(cr - log(0.85)) + 5 * max(0, abs(icc_anova(y, vill) - 0.06) - 0.01)
}
starts <- lapply(302 + 0:11, fast_match); Ls <- sapply(starts, logit_loss)
member <- starts[[which.min(Ls)]]
# Newton-guided swap search: at the current fit, the change in X'y needed to move
# the fitted coefficients to the targets is H (b* - b); pick the swap that best
# supplies it, confirm with the exact fit, repeat.
polish <- function(y, iters = 400) {
  L <- logit_loss(y); mem <- which(y == 1); non <- which(y == 0)
  for (k in seq_len(iters)) {
    f <- suppressWarnings(glm.fit(Xf, y, family = binomial())); ph <- f$fitted.values; bh <- f$coefficients
    H <- crossprod(Xf, Xf * ph * (1 - ph)); Hi <- solve(H)
    D <- c(0, bL - bh[-1]); D[1] <- -sum(H[1, -1] * D[-1]) / H[1, 1]; dS <- drop(H %*% D)
    fc <- glm.fit(Xc1, y, family = binomial()); pf <- fc$fitted.values
    Hc <- crossprod(Xc1, Xc1 * pf * (1 - pf)); Dc <- c(0, log(0.85) - fc$coefficients[2])
    Dc[1] <- -Hc[1, 2] * Dc[2] / Hc[1, 1]; dSc <- drop(Hc %*% Dc); Hci <- solve(Hc)
    ii <- rep(mem, each = length(non)); jj <- rep(non, times = length(mem))
    dP <- Xf[jj, ] - Xf[ii, ]                                   # change in X'y for each swap
    E <- (dP - matrix(dS, nrow(dP), 5, byrow = TRUE)) %*% t(Hi[-1, ])
    Ec <- (dP[, 1:2] - matrix(dSc, nrow(dP), 2, byrow = TRUE)) %*% Hci[2, ]
    sc <- rowSums((E / 0.002)^2) + (Ec / 0.002)^2
    best <- order(sc)[1:20]; moved <- FALSE
    for (b in best) {
      y2 <- y; y2[ii[b]] <- 0; y2[jj[b]] <- 1; L2 <- logit_loss(y2)
      if (L2 < L) { y <- y2; L <- L2; mem <- which(y == 1); non <- which(y == 0); moved <- TRUE; break }
    }
    if (!moved || L < 0.02) break
  }
  attr(y, "loss") <- L; y
}
member <- polish(member); L <- attr(member, "loss")
cat("cbhi: gradient", round(g_opt, 3), " edu cuts", q_opt, " lattice err", signif(gb$err, 3), " final loss", L, "\n")
member <- as.integer(member)
set.seed(303)
hh_size <- pmin(12, 2 + rpois(n_h, 3))
fac_use <- rbinom(n_h, 1, plogis(-1.2 + 0.55 * member + 0.15 * wealth_h - 0.06 * dist))
sick <- rbinom(n_h, 1, 0.28)
sought <- ifelse(sick == 1, rbinom(n_h, 1, plogis(-0.1 + 0.6 * member + 0.2 * wealth_h +
                                                      0.3 * (edu != "none") - 0.05 * dist)), NA)
reasons <- c("lack of knowledge", "lack of money", "bad image", "lack of trust", "other")
reason <- ifelse(member == 1, NA, sample(reasons, n_h, TRUE, prob = c(0.34, 0.30, 0.12, 0.16, 0.08)))
satisf <- ifelse(member == 1, sample(1:5, n_h, TRUE, prob = c(0.06, 0.12, 0.22, 0.40, 0.20)), NA)
cbhi <- data.frame(hh_id = sprintf("H%03d", 1:n_h), village_id = vill, distance_km = dist,
                   wealth_index = wealth_h, maternal_education = as.character(edu),
                   household_size = hh_size, cbhi_member = member,
                   facility_use_past_month = fac_use, child_sick_2wk = sick,
                   sought_formal_care = sought, reason_not_joining = reason,
                   satisfaction_1to5 = satisf)
wcsv(cbhi, "cbhi_survey.csv")

# ============================================================================
# 4. cohort_dropout.csv -- Analysis Journey 14.7: 300 newly enrolled CBHI
#    households followed up to 24 months. Cox: intervention, income (Rs 1000
#    per month), distance (km). Tuned towards HR 0.58 / 0.94 / 1.11 and
#    log-rank p = 0.01.
# ============================================================================
set.seed(401)
n_c <- 300
income <- round(pmax(2, rnorm(n_c, 10, 4.8)), 1)
dist_c <- round(pmax(0.3, rgamma(n_c, shape = 4, scale = 1.4)), 1)
interv <- rbinom(n_c, 1, plogis(0.02 * (income - 10) + 0.03 * (dist_c - 5.6)))
bC <- log(c(0.58, 0.94, 1.11))
Xc <- cbind(interv, income, dist_c)
lp <- drop(Xc %*% bC)
lam0 <- 0.026
draw_time <- function(i) {
  t_ev <- rexp(1, lam0 * exp(lp[i]))
  t_mv <- if (runif(1) < 0.10) runif(1, 0.5, 24) else Inf     # moved away
  t <- min(t_ev, t_mv, 24)
  c(time = max(0.1, round(t, 1)), event = as.integer(t_ev <= min(t_mv, 24)),
    moved = as.integer(t_mv < min(t_ev, 24)))
}
draw_all <- function() {                      # vectorised version of draw_time for all subjects
  t_ev <- rexp(n_c, lam0 * exp(lp)); mv <- runif(n_c) < 0.10
  t_mv <- ifelse(mv, runif(n_c, 0.5, 24), Inf); t <- pmin(t_ev, t_mv, 24)
  cbind(time = pmax(0.1, round(t, 1)), event = as.integer(t_ev <= pmin(t_mv, 24)),
        moved = as.integer(t_mv < pmin(t_ev, 24)))
}
cands <- lapply(1:3000, function(k) draw_all())
cox_loss <- function(TT) {
  f <- coxph(Surv(TT[, "time"], TT[, "event"]) ~ Xc, ties = "efron")
  co <- coef(f)
  lr <- survdiff(Surv(TT[, "time"], TT[, "event"]) ~ interv)
  p_lr <- pchisq(lr$chisq, 1, lower.tail = FALSE)
  zp <- cox.zph(f)$table[, "p"]
  sum(abs(exp(co) - c(0.58, 0.94, 1.11)) > 0.004) + sum(abs(co - bC)) * 5 +
    (abs(p_lr - 0.01) > 0.0005) + abs(log(p_lr / 0.01)) + (min(zp) < 0.10)
}
Ls <- sapply(cands, cox_loss); TT <- cands[[which.min(Ls)]]
redraw1 <- function(TT) { i <- sample(n_c, 1); TT[i, ] <- draw_time(i); TT }
set.seed(402); L <- cox_loss(TT)
for (it in 1:3000) {                          # best of 8 single-subject redraws per step
  props <- lapply(1:8, function(k) redraw1(TT)); Lp <- sapply(props, cox_loss)
  if (min(Lp) < L) { TT <- props[[which.min(Lp)]]; L <- min(Lp) }
  if (L < 0.03) break
}
attr(TT, "loss") <- L
cat("cox greedy loss:", attr(TT, "loss"), "\n")
cohort <- data.frame(hh_id = sprintf("D%03d", 1:n_c), intervention = interv,
                     income_k = income, distance_km = dist_c,
                     time_months = TT[, "time"], dropout = TT[, "event"],
                     censor_reason = ifelse(TT[, "event"] == 1, "",
                                            ifelse(TT[, "moved"] == 1, "moved away", "enrolled at 24 months")))
wcsv(cohort, "cohort_dropout.csv")

# ============================================================================
# 5. Small teaching sets for the new v3.0 sections (plan/GAPS.md)
# ============================================================================
# 5a. ebf_diarrhoea_cohort.csv -- 10.6.4 (2x2 cohort) and 11.7 (stratified by PHC)
#     200 infants from two PHCs; exposure = NOT exclusively breastfed to 6 months,
#     outcome = any diarrhoea episode in the next 6 months.
mk <- function(phc, ebf, diar, n) data.frame(phc = phc, not_ebf = ebf, diarrhoea = rep(c(1, 0), c(diar, n - diar)))
ebf <- rbind(mk("PHC Urban", 1, 9, 30), mk("PHC Urban", 0, 9, 90),
             mk("PHC Rural", 1, 24, 50), mk("PHC Rural", 0, 5, 30))
set.seed(501); ebf <- ebf[sample(nrow(ebf)), ]
ebf <- data.frame(infant_id = sprintf("E%03d", 1:nrow(ebf)), ebf)
wcsv(ebf, "ebf_diarrhoea_cohort.csv")

# 5b. matched_casecontrol.csv -- 10.8 (matched-pair OR = b/c) and 13.2.9 (clogit)
#     80 pairs: case = child with diarrhoea needing ORS/IV at a PHC, control =
#     neighbourhood child of the same age band; exposure = not exclusively breastfed.
#     Pairs: both exposed 16, case only 24, control only 10, neither 30.
pairs <- rbind(cbind(1, 1)[rep(1, 16), , drop = FALSE], cbind(1, 0)[rep(1, 24), , drop = FALSE],
               cbind(0, 1)[rep(1, 10), , drop = FALSE], cbind(0, 0)[rep(1, 30), , drop = FALSE])
set.seed(502); pairs <- pairs[sample(80), ]
mcc <- data.frame(pair_id = rep(sprintf("P%02d", 1:80), each = 2), case = rep(c(1, 0), 80),
                  not_ebf = as.vector(t(pairs)))
wcsv(mcc, "matched_casecontrol.csv")

# 5c. standardisation_districts.csv -- 7.4.2 / 7.4.3: two hypothetical districts'
#     age-specific deaths and mid-year populations, plus a standard population
#     and standard (state) age-specific death rates for the indirect method.
std <- data.frame(
  age_group = c("0-4", "5-14", "15-29", "30-44", "45-59", "60+"),
  popA = c(9000, 17000, 26000, 22000, 16000, 10000),    # older, urban district
  deathsA = c(90, 17, 39, 55, 128, 460),
  popB = c(16000, 26000, 28000, 16000, 9000, 5000),     # younger, tribal district
  deathsB = c(208, 39, 56, 51, 90, 280),
  std_pop = c(10000, 20000, 27000, 20000, 14000, 9000), # standard population (100,000)
  std_rate_per1000 = c(9.0, 1.2, 1.8, 2.9, 8.5, 48.0))  # standard age-specific rates
wcsv(std, "standardisation_districts.csv")

# 5d. lifetable_district.csv -- 7.5 abridged current life table (hypothetical district)
lt <- data.frame(age_start = c(0, 1, 5, 15, 30, 45, 60),
                 age_end = c(1, 5, 15, 30, 45, 60, NA),
                 midyear_pop = c(3000, 12500, 30000, 42000, 34000, 24000, 14500),
                 deaths = c(93, 30, 21, 63, 102, 216, 870))
wcsv(lt, "lifetable_district.csv")

# 5e. sign_test_hb.csv -- 10.1.1: 12 women's Hb (g/dL) before and after 12 weeks
#     of iron-folic acid; 10 rise, 2 fall, no ties.
hb <- data.frame(woman_id = sprintf("W%02d", 1:12),
                 hb_before = c(9.1, 10.2, 8.7, 9.8, 10.5, 9.4, 8.9, 10.8, 9.6, 10.1, 9.0, 10.4),
                 hb_after  = c(9.1, 10.2, 8.7, 9.8, 10.5, 9.4, 8.9, 10.8, 9.6, 10.1, 9.0, 10.4) +
                   c(0.8, 0.4, 1.1, -0.3, 0.7, 0.9, 0.6, -0.2, 1.0, 1.2, 0.5, 1.3))
wcsv(hb, "sign_test_hb.csv")

# 5f. meta_three_trials.csv -- 15.7: three hypothetical trials of a community
#     intervention (outcome: low birthweight), events/total per arm.
meta3 <- data.frame(study = c("Trial A", "Trial B", "Trial C"),
                    events_int = c(38, 60, 15), n_int = c(400, 450, 150),
                    events_ctl = c(56, 64, 27), n_ctl = c(400, 450, 150))
wcsv(meta3, "meta_three_trials.csv")

# 5g. kappa_anaemia.csv -- 16.3.3.1: two raters' pallor-based anaemia calls on
#     100 patients. Table: both yes 11, A yes/B no 10, A no/B yes 5, both no 74.
kp <- rbind(cbind(1, 1)[rep(1, 11), , drop = FALSE], cbind(1, 0)[rep(1, 10), , drop = FALSE],
            cbind(0, 1)[rep(1, 5), , drop = FALSE], cbind(0, 0)[rep(1, 74), , drop = FALSE])
set.seed(507); kp <- kp[sample(100), ]
kappa <- data.frame(patient_id = sprintf("K%03d", 1:100),
                    rater_A = ifelse(kp[, 1] == 1, "anaemic", "not anaemic"),
                    rater_B = ifelse(kp[, 2] == 1, "anaemic", "not anaemic"))
wcsv(kappa, "kappa_anaemia.csv")

# 5h. bp_methods.csv -- 16.3.5 Bland-Altman: systolic BP (mmHg) by mercury and
#     digital device in 30 adults at a PHC NCD clinic.
set.seed(508)
true_bp <- round(rnorm(30, 132, 16))
bp <- data.frame(adult_id = sprintf("B%02d", 1:30),
                 sbp_mercury = true_bp + round(rnorm(30, 0, 3)),
                 sbp_digital = true_bp + round(rnorm(30, 3, 4.5)))
wcsv(bp, "bp_methods.csv")

# 5i. km_eight.csv -- 14.4 hand-worked Kaplan-Meier table (8 CBHI members,
#     months to dropout; event 0 = censored).
km8 <- data.frame(member_id = sprintf("M%d", 1:8),
                  time_months = c(2, 4, 4, 6, 7, 9, 11, 12),
                  dropout = c(1, 1, 0, 1, 0, 1, 1, 0))
wcsv(km8, "km_eight.csv")

# 5j. nfhs_extract.csv -- 15.2.6 complex survey: NFHS-style extract of women
#     15-49, 4 strata (2 districts x urban/rural), 8 PSUs per stratum, 20 women
#     per PSU; urban PSUs over-sampled, so weights differ.
set.seed(510)
strata <- expand.grid(res = c("urban", "rural"), district = c("District A", "District B"),
                      stringsAsFactors = FALSE)
strata$pop_women <- c(60000, 140000, 30000, 170000)
strata$prev <- c(0.42, 0.58, 0.48, 0.64)
rows <- list(); psu_no <- 0
for (s in seq_len(nrow(strata))) for (p in 1:8) {
  psu_no <- psu_no + 1
  u <- rnorm(1, 0, 0.60); n_w <- 20
  edu_n <- sample(c("none", "primary", "secondary+"), n_w, TRUE,
                  prob = if (strata$res[s] == "urban") c(0.15, 0.30, 0.55) else c(0.35, 0.35, 0.30))
  eta <- qlogis(strata$prev[s]) + u - 0.35 * (edu_n == "secondary+")
  rows[[psu_no]] <- data.frame(stratum = paste(strata$district[s], strata$res[s], sep = " - "),
                               district = strata$district[s], residence = strata$res[s],
                               psu = sprintf("PSU%02d", psu_no),
                               weight = round(strata$pop_women[s] / (8 * n_w), 1),
                               age = sample(15:49, n_w, TRUE), education = edu_n,
                               anaemic = rbinom(n_w, 1, plogis(eta)))
}
nfhs <- do.call(rbind, rows)
nfhs <- data.frame(woman_id = sprintf("N%03d", seq_len(nrow(nfhs))), nfhs)
wcsv(nfhs, "nfhs_extract.csv")

# 5k. malaria_villages.csv -- 13.4-13.6: 10 villages, annual cases, population,
#     near standing water. Poisson with log(population) offset: IRR = 2.30.
mal <- data.frame(village = sprintf("MV%02d", 1:10),
                  near_water = c(1, 1, 1, 1, 1, 0, 0, 0, 0, 0),
                  population = c(1200, 2600, 900, 3100, 1700, 4000, 2200, 3300, 1500, 2500),
                  cases = c(30, 45, 28, 68, 20, 40, 11, 39, 9, 19))
wcsv(mal, "malaria_villages.csv")

# 5l. pps_villages.csv -- 6.2.6: sampling frame of 10 villages for PPS selection.
pps <- data.frame(village = sprintf("PV%02d", 1:10),
                  population = c(1450, 820, 2310, 640, 1780, 3050, 990, 1210, 2600, 1150))
wcsv(pps, "pps_villages.csv")

cat("make_data.R: all datasets written to", OUT, "\n")
