# Security policy

## Supported versions

SmithLab is in beta. Security fixes are made on the latest release only.

| Version | Supported |
|---|---|
| 0.9.x | Yes |
| earlier | No |

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's private vulnerability
reporting:

**[Report a vulnerability](https://github.com/IronMan1405/SmithLab/security/advisories/new)**
(also available from the repository's **Security** tab).

Do not open a public issue, pull request or discussion for a security problem.

Please include:

- what the issue is and what an attacker could do with it;
- steps or input to reproduce it (for example, the expression text involved);
- the browser and SmithLab version or commit you used.

SmithLab is maintained by one person, so responses are on a best-effort basis.
You will be told when the report has been received, whether it is accepted,
and when a fix is released. Please allow time for a fix before disclosing the
issue publicly.

## Scope

SmithLab is a static, client-side web application:

- it has no server component, accounts or telemetry, and makes no network
  requests of its own;
- the only data it stores is the colour-theme preference, in the browser's
  `localStorage`;
- expressions are parsed by a hand-written parser and evaluated by an
  interpreter; user input is never passed to `eval` or `Function`.

Relevant reports include, for example, a way for expression text or other
input to run script in the page, or a problem in the production build or its
dependencies that affects users of the app. Vulnerabilities in development-only
tooling that do not affect the built app are still welcome, but are treated as
lower priority.
