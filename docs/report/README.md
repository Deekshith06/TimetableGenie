# TimetableGenie Research & Technical Report

This directory contains the complete Springer Nature formatted LaTeX source code, figures, bibliography, and compiled PDF report for **TimetableGenie** (Smart India Hackathon Problem Statement SIH25091).

## Author & Citation
- **Author:** Seelaboyina Deekshith ([@Deekshith06](https://github.com/Deekshith06))
- **Affiliation:** Department of Computer Science and Engineering
- **Title:** *TimetableGenie: A Constraint-Based Multidisciplinary Timetabling System with Independent Auditing and Disruption-Aware Repair*

## Document Artifacts
- **Compiled PDF:** [`TimetableGenie_Report.pdf`](TimetableGenie_Report.pdf)
- **Primary LaTeX Source:** [`TimetableGenie_Report.tex`](TimetableGenie_Report.tex)
- **Class and Style Definitions:** `sn-jnl.cls`, `algorithm.sty`, `algorithmicx.sty`, `algpseudocode.sty`
- **Bibliography & References:** `references.tex`, `sn-mathphys-num.bst`
- **Architectural & Benchmark Figures:** `fig1_framework.pdf`, `fig2_pilot.pdf`

## How to Compile

### Option 1: Fast Single-Command Build with Tectonic (Recommended)
```bash
tectonic TimetableGenie_Report.tex
```

### Option 2: Standard pdflatex Pipeline
```bash
pdflatex TimetableGenie_Report.tex
bibtex TimetableGenie_Report
pdflatex TimetableGenie_Report.tex
pdflatex TimetableGenie_Report.tex
```
