---
name: Personal Finance Tracker
description: Quiet teal personal finance workspace
colors:
  light-background: "#f3f6f5"
  light-foreground: "#18332f"
  light-card: "#ffffff"
  light-card-foreground: "#18332f"
  light-border: "#dde7e3"
  light-muted: "#5f756e"
  light-muted-bg: "#edf3f0"
  light-primary: "#157363"
  light-primary-foreground: "#ffffff"
  light-income: "#16806b"
  light-income-bg: "#ecfdf5"
  light-expense: "#dc2626"
  light-expense-bg: "#fef2f2"
  light-accent: "#157363"
  light-accent-bg: "#e7f3ed"
  light-form-bg: "#f5faf7"
  light-form-border: "#b7d9cb"
  dark-background: "#0c1716"
  dark-foreground: "#e9f3ee"
  dark-card: "#18332f"
  dark-card-foreground: "#e9f3ee"
  dark-border: "#243b35"
  dark-muted: "#a0b7ad"
  dark-muted-bg: "#243b35"
  dark-primary: "#60c8aa"
  dark-primary-foreground: "#102e25"
  dark-income: "#10b981"
  dark-income-bg: "rgba(6, 78, 59, 0.3)"
  dark-expense: "#ef4444"
  dark-expense-bg: "rgba(127, 29, 29, 0.3)"
  dark-accent: "#60c8aa"
  dark-accent-bg: "rgba(58, 137, 110, 0.13)"
  dark-form-bg: "#142923"
  dark-form-border: "#2c5d4e"
  danger: "#b91c1c"
  danger-hover: "#991b1b"
typography:
  headline:
    fontFamily: '"Manrope", "Segoe UI", sans-serif'
    fontSize: "1.8rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.04em"
  headline-wide:
    fontFamily: '"Manrope", "Segoe UI", sans-serif'
    fontSize: "2.25rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.04em"
  amount:
    fontFamily: '"Manrope", "Segoe UI", sans-serif'
    fontSize: "1.375rem"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  amount-main:
    fontFamily: '"Manrope", "Segoe UI", sans-serif'
    fontSize: "1.75rem"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  amount-main-wide:
    fontFamily: '"Manrope", "Segoe UI", sans-serif'
    fontSize: "2.25rem"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  body:
    fontFamily: '"Manrope", "Segoe UI", sans-serif'
  subtitle:
    fontFamily: '"Manrope", "Segoe UI", sans-serif'
    fontSize: "0.875rem"
    lineHeight: 1.65
  label:
    fontFamily: '"Manrope", "Segoe UI", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 500
  navigation:
    fontFamily: '"Manrope", "Segoe UI", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 600
  button:
    fontFamily: '"Manrope", "Segoe UI", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 550
rounded:
  panel: "1rem"
  control: "0.625rem"
  status: "0.5rem"
  progress: "0.375rem"
spacing:
  small: "0.5rem"
  medium: "0.75rem"
  base: "1rem"
  panel-compact: "1.25rem"
  panel: "1.5rem"
  section: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.light-primary}"
    textColor: "{colors.light-primary-foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.875rem"
  button-secondary:
    backgroundColor: "{colors.light-card}"
    textColor: "{colors.light-foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.875rem"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.light-primary-foreground}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.875rem"
  input:
    backgroundColor: "{colors.light-card}"
    textColor: "{colors.light-foreground}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.75rem"
  panel:
    backgroundColor: "{colors.light-card}"
    rounded: "{rounded.panel}"
  navigation-active:
    backgroundColor: "{colors.light-accent-bg}"
    textColor: "{colors.light-primary}"
    typography: "{typography.navigation}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.875rem"
  chart-period-active:
    backgroundColor: "{colors.light-accent-bg}"
    textColor: "{colors.light-primary}"
    padding: "0.65rem 0.85rem"
---
# Design System: Personal Finance Tracker

## Overview

An Indonesian personal finance workspace with clear amounts, quiet green neutrals, and a restrained teal accent. The approved direction is tidy, with prominent amounts and short, gentle animations. Light and dark themes share the same hierarchy and semantic color roles.

**Key Characteristics:**

- Prominent tabular amounts with exact rupiah grouping.
- Quiet bordered surfaces and teal selection states.
- Short motion that explains navigation and changes in state.

## Colors

The palette combines muted green neutrals with a teal action accent. The frontmatter records both themes; component tokens show the light assignment, while runtime CSS custom properties supply the active theme.

### Primary

Teal identifies primary actions, active navigation, selected chart periods, and chart strokes. Accent backgrounds soften selected and summary surfaces. Primary foreground is theme specific.

### Neutral

Background supports the page, card supports panels and controls, and border separates surfaces. Foreground carries main content; muted carries secondary text. Muted background supports hover and quiet states. Form background and form border distinguish editing regions.

Income and expense have separate semantic text and background roles. Destructive controls and validation share the danger color; warning and over-budget progress states retain their existing semantic colors.

## Typography

Manrope is served locally from `/fonts/manrope.ttf` as a variable TrueType font with weights 400 through 800 and `font-display: swap`; its OFL license is in `frontend/public/fonts/OFL.txt`. The fallback stack is Segoe UI, then sans-serif. Body numerals are tabular.

Page titles use the headline role and switch to headline-wide at the small breakpoint. Main amounts use amount-main and amount-main-wide; supporting amounts use amount. Subtitle copy is muted and limited to 65ch. Labels and navigation use their own roles. Native financial strings retain their integer precision.

## Layout

The centered shell spans the available width up to 80rem. Inline gutters grow from 1rem to 1.5rem at 640px, then 2rem at 1024px. Main content has 2.5rem top and 3.5rem bottom padding. Page headers stack until 1024px.

Metric panels use one column below 640px, two columns with a full-width lead metric from 640px, and four columns with a two-column lead metric from 1280px. Metrics use 1rem gaps, increasing to 1.25rem at 1280px. Dashboard sections use 2rem gaps. Mobile navigation has three equal columns; desktop navigation appears at 1024px. The sticky topbar uses layer 10 and the focused skip link layer 20; modal dialogs use the browser top layer.

Charts reduce height and spacing below 640px, with their caption and selected value stacked. Long financial values can wrap between protected digit groups.

## Elevation & Depth

Panels primarily use tonal layering and a thin border. Small utility shadows remain on selected dashboard controls. Confirmation dialogs use the stronger dialog shadow recorded in the sidecar; backdrop opacity increases in dark mode. Avoid treating every panel as a floating card.

## Shapes

Panels and native dialogs use the panel radius; buttons, fields, and navigation use the control radius. Status badges and progress bars have their smaller radii. Chart period controls use a slightly rounder 0.65rem shape. The wallet brand mark has its own compact rounded square.

## Components

### Buttons

Primary actions use teal with the matching primary foreground. Secondary actions use card and foreground colors with a border. Destructive actions use danger and a darker hover shade. Controls have a minimum height of 2.75rem. Hover gently lifts buttons and active presses lower them when motion is allowed. Disabled controls use opacity 0.55 and a not-allowed cursor.

### Inputs / Fields

Fields use card surfaces, a thin border, the control radius, and a minimum height of 2.75rem. Hover shifts the border to muted. Invalid fields use danger borders and explicit error text. Visible keyboard focus uses a 2px accent outline offset by 3px.

### Navigation

Muted links become foreground on a muted hover surface. Current links use accent background and primary text with an animated short underline when motion is allowed. Desktop and mobile navigation retain text and icons.

### Cards / Containers

Panels use the card surface and a thin border. Metric and chart padding varies with the viewport; forms use 1.5rem padding with the distinct form surface and border. The lead metric uses accent background and stronger amount scale. Transaction tables preserve headers, row separation, and quiet hover feedback.

### Chart periods and status badges

Chart period buttons expose selection through `aria-pressed` and a tinted surface, with exact values under each period label. Status badges combine text and icons with semantic colors. Budget progress bars use green, warning, and over-budget states alongside textual amounts.

The expense history ends at the selected month's actual total, preceded by the three historical months when available. Markers stay circular at all widths. Expense allocation uses a filled pie with a category legend, exact amounts, selectable slices, and keyboard interaction. Category colors support data differentiation within the teal visual system.

History lines and their filled area share a smooth monotone curve through the actual data points. Flat periods remain flat, and curved segments stay within adjacent monthly values.

Monthly forecasts distinguish historical three-month averages from temporary current-month run-rate estimates. The latter shows elapsed days and its constant daily pace assumption; historical periods do not receive this extrapolation. Actual spending, the signed difference, historical availability, and method/evaluation details remain visible or discoverable.

### Motion and dialogs

History charts reveal their line through an SVG clip over 700ms and reveal their area over 550ms on mounting. Pie charts have a bounded 500ms entrance and 160ms selection feedback. Routes use native View Transitions where supported and a 280ms entrance fallback. Forms enter over 240ms and exit over 150ms; outgoing form content remains inert. Native confirmation dialogs enter over 240ms and close over 140ms while retaining their focus trap. Feedback transitions generally take 160ms; row arrivals range from 260ms to 350ms, with short progress and notice feedback.

Reduced motion disables CSS spatial entrance animations and native route transitions. Forms and dialog closing use an 80ms opacity transition without spatial movement. The full timing and focus treatments live in the sidecar.

## Do's and Don'ts

### Do:

- Do use the matching light or dark semantic color role.
- Do preserve exact rupiah grouping and tabular numerals through the Money component.
- Do keep visible focus, descriptive chart labels, and native dialog behavior.
- Do honor reduced motion for spatial animation.

### Don't:

- Don't present synthetic balances or projected values as historical chart data.
- Don't add perpetual decorative motion.
- Don't use color alone to convey financial status; retain labels and amounts.
