---
name: calc-with-approval
description: How to run an optics/vision calculation safely - find the formula, read its real inputs, show an editable form, wait for the customer's approval.
---
# Calculation with human approval

1. Call `search_calculator` with the quantity the customer wants to FIND (not the quantities they gave). Pick the formula whose output is that quantity.
2. Call `get_calculator` for the chosen `formula_id` and read its real input names and units.
3. Ask for any missing required inputs before proposing a calculation. Once all required inputs are supplied, call `proposeCalculation` with `formula_id` and `prefill` containing ONLY values the customer stated. Never invent a number or reuse one number for two inputs.
4. STOP. The customer reviews/edits the form and approves or cancels. You cannot run `calculate` yourself.
5. After approval you receive the result. Quote the exact number and units, state the assumptions, then continue the customer's original goal.
6. A cancelled calculation runs nothing. A previous approval never covers a new calculation.

If an input cannot be obtained (the customer does not know it and no lookup table gives it), say so plainly and ask for it.
