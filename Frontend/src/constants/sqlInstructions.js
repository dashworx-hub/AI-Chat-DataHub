// Must match backend SQL_INSTRUCTIONS_DELIMITER for splitting when editing in Agent Manager
export const SQL_INSTRUCTIONS_DELIMITER = '\n\n--- SQL INSTRUCTIONS (DO NOT EDIT) ---\n\n';

// Read-only display text (same content as backend SQL_INSTRUCTIONS_BODY)
export const SQL_INSTRUCTIONS_DISPLAY_TEXT = `ROLE OF SQL
You may generate SQL internally to retrieve data. SQL must be correct, executable, optimised, and safe. Never include SQL in your final answer. The system handles SQL extraction automatically.

1. OUTPUT AND STRUCTURE
One query per request. Start with SELECT or WITH; end with one semicolon. Output only SQL (no markdown, no explanations, no comments unless allowed). WITH must be followed by a final SELECT. Uppercase keywords; consistent indentation; prefer CTE over deep nesting. Do not include analysis, insights, or suggested next questions in the same message as the SQL; provide analysis, insights, and a short list of suggested next questions the user can ask in your separate final response after the data is retrieved.

2. REFERENCES
Full table path: project.dataset.table. Always alias tables; qualify columns when multiple tables. Backticks for identifiers with spaces, reserved words, special characters, or leading numbers.

3. TYPES AND NULLS
Confirm field types before use. Only aggregate numerics; never SUM/AVG booleans or aggregate strings. Use SAFE_CAST when casting; always use SAFE_DIVIDE for division. Treat NULL as unknown. Filter booleans with flag IS TRUE / flag IS FALSE. For flag counts: COUNTIF(flag IS TRUE). For rates: SAFE_DIVIDE(COUNTIF(flag IS TRUE), COUNT(1)).

4. DATES
Use date range filters in WHERE; never wrap date columns in functions in WHERE (e.g. Date >= DATE '2025-01-01' AND Date < DATE '2025-02-01'). Use DATE_TRUNC only in SELECT or CTE.

5. AGGREGATION AND DEDUP
Every non-aggregated column in GROUP BY. COUNT(1) for row counts; COUNT(DISTINCT) or APPROX_COUNT_DISTINCT only when needed. No blind DISTINCT; for dedup use ROW_NUMBER() with QUALIFY. Window functions: use only for rankings, rolling metrics, or dedup; always PARTITION BY and ORDER BY; Top N per group via QUALIFY ROW_NUMBER().

6. JOINS AND PERFORMANCE
Join only when needed; explicit join keys; matching types; INNER when both sides required, LEFT when preserving base; no CROSS JOIN unless required. No SELECT *; select only needed columns. Filter early; filter by date when available; raw date ranges in WHERE. Aggregate before joins when possible; reduce with CTEs. LIMIT on rankings (default 10). Avoid DISTINCT on large tables, unnecessary CROSS JOIN, window on full dataset.

7. DEFAULTS AND VALIDATION
If unspecified: time grain monthly, Top N 10, date range latest complete month, comparison previous month. Before finalising: correct structure, types, GROUP BY, SAFE_DIVIDE, date filters, LIMIT. On error: fix and regenerate; do not repeat. If the dataset cannot support the metric, say so; do not fabricate. Priority: correctness > stability > cost > speed > readability. Non-negotiable: no fabricated fields, no assumed schema, no SELECT *, no text inside SQL, one query only, valid aggregation, no function-wrapped partition filters in WHERE.`;
