# Recommended Source Types — AI Cyber Horizon Scan

## Design Principle

Source type should describe:

> “What kind of intelligence object is this source?”

Source type is NOT:
- the AI threat category
- the attack vector
- the affected system
- the severity
- the maturity level

Those belong in later taxonomy, analytics, and classification layers.

A source should have:
- ONE primary `source_type`
- optional secondary metadata later if needed

---

# Tier 1 — Core Operational Intelligence Objects

These are the highest-priority operational intelligence objects.

They should dominate:
- Rawfact extraction
- evidence selection
- incident walkthroughs
- operational trend analysis
- slide examples

---

## 1. vulnerability

### Definition

A disclosed weakness affecting:
- AI systems
- AI infrastructure
- AI tooling
- model pipelines
- orchestration systems
- AI-related software

### Examples

- CVEs
- MCP flaws
- LangChain vulnerabilities
- Semantic Kernel RCE
- plugin vulnerabilities
- model repository flaws

### Why This Exists

A vulnerability represents:
- latent exploitable weakness
- attack surface expansion
- ecosystem exposure

A vulnerability is NOT the same as an exploit or incident.

### Key Analytics Dimensions

- exploitability
- blast radius
- affected ecosystem
- patch availability
- exploitation status
- privilege boundary crossed

---

## 2. exploit_disclosure

### Definition

A demonstrated exploit, jailbreak, bypass, exploit chain, attack methodology, or operational attack walkthrough.

### Examples

- prompt injection exploit chains
- jailbreak methodologies
- sandbox escapes
- MCP function hijacking
- autonomous exploit chaining
- exploit PoC repositories

### Why This Exists

A vulnerability represents potential exposure.

An exploit disclosure represents:
- operationalization
- attacker practicality
- exploit feasibility

This distinction is critical in horizon scanning.

### Key Analytics Dimensions

- operational realism
- reproducibility
- required access
- automation potential
- sophistication
- exploit chain depth

---

## 3. incident

### Definition

A confirmed real-world operational event involving:
- compromise
- fraud
- abuse
- misuse
- disruption
- exposure
- malicious deployment

### Examples

- deepfake fraud
- AI-enabled phishing campaign
- AI infrastructure compromise
- exposed agent workflows
- AI impersonation scams

### Why This Exists

Incidents are the strongest evidence objects.

They demonstrate:
- real-world operationalization
- attacker adoption
- measurable impact

### Key Analytics Dimensions

- impact scale
- targeted sector
- repeatability
- institutional response
- operational maturity

---

## 4. threat_intelligence

### Definition

Operational reporting about:
- active adversary behavior
- campaigns
- TTPs
- ecosystem activity
- attacker adaptation

### Examples

- Mandiant reporting
- Microsoft Threat Intelligence
- Recorded Future
- Google Threat Intelligence
- CISA threat advisories

### Why This Exists

Threat intelligence provides:
- campaign linkage
- operational trends
- TTP evolution
- adversary adaptation visibility

### Key Analytics Dimensions

- campaign scope
- attribution confidence
- operational relevance
- TTP reuse
- active exploitation

---

## 5. research_finding

### Definition

Research introducing:
- new attacks
- attack surfaces
- evaluations
- defensive gaps
- operational observations
- capability discoveries

### Examples

- adversarial ML papers
- LLM security research
- agentic AI exploit research
- evaluation studies
- arXiv papers

### Why This Exists

Research findings act as:
- weak signals
- future operational indicators
- emerging attack-surface indicators

### Key Analytics Dimensions

- novelty
- operationalization likelihood
- reproducibility
- research-to-threat pipeline
- ecosystem applicability

---

# Tier 2 — Defensive / Governance / Ecosystem Signals

These are not operational attack objects.

They represent:
- institutional adaptation
- ecosystem evolution
- governance pressure
- defensive maturity

These are important for:
- strategic analysis
- outlooks
- maturity assessment
- horizon evolution

---

## 6. defensive_capability

### Definition

A mitigation, security control, detection method, evaluation framework, runtime protection, or defensive security capability.

### Examples

- prompt injection defenses
- runtime permission enforcement
- agent guardrails
- adversarial ML detection
- AI SOC tooling

### Why This Exists

Defensive evolution is part of the horizon.

This helps answer:
- how defenders are adapting
- where security gaps remain

### Key Analytics Dimensions

- deployment readiness
- effectiveness
- ecosystem applicability
- gap coverage

---

## 7. governance_signal

### Definition

Governmental, regulatory, institutional, standards, compliance, or governance developments relevant to AI cyber risk.

### Examples

- NIST guidance
- EU AI Act implications
- MAS/ECB warnings
- AI governance frameworks
- AI security standards

### Why This Exists

This category captures:
- governance pressure
- institutional recognition
- regulatory adaptation
- systemic concern

### Key Analytics Dimensions

- authority
- sector scope
- governance pressure
- compliance implications
- systemic recognition

---

## 8. ecosystem_signal

### Definition

Signals indicating ecosystem-level shifts in:
- adoption
- infrastructure
- tooling
- commercialization
- deployment
- operational integration

### Examples

- widespread MCP adoption
- agentic workflow deployment
- AI coding-agent rollout
- enterprise LLM integration
- infrastructure convergence

### Why This Exists

Ecosystem shifts drive:
- attack surface expansion
- dependency growth
- operational convergence
- downstream security implications

### Key Analytics Dimensions

- adoption velocity
- infrastructure penetration
- ecosystem dependency
- downstream attack-surface growth

---

## 9. societal_harm_signal

### Definition

Signals showing:
- societal harm
- institutional harm
- trust erosion
- public harm
- synthetic media abuse
- identity abuse

arising from AI-enabled cyber activity.

### Examples

- deepfake abuse
- AI impersonation scams
- trust erosion
- school/public institution responses
- synthetic identity fraud

### Why This Exists

This category tracks:
- public impact
- institutional reaction
- trust degradation
- societal adaptation

### Key Analytics Dimensions

- societal impact
- institutional response
- scale
- repeatability
- public safety implications

---

# Tier 3 — Strategic / Capability / Meta Objects

These are not direct operational evidence.

They support:
- strategic outlooks
- capability trajectory analysis
- long-range horizon analysis
- convergence analysis

---

## 10. benchmark_evaluation

### Definition

Formal:
- evaluations
- benchmarks
- red-team exercises
- capability testing
- maturity assessments
- safety testing

### Examples

- AI Safety Institute evaluations
- autonomous exploit benchmarks
- red-team reports
- model capability testing

### Why This Exists

Benchmarks often become:
- leading indicators
- operational capability predictors
- future risk indicators

### Key Analytics Dimensions

- capability significance
- benchmark credibility
- operational implications
- trajectory relevance

---

## 11. strategic_signal

### Definition

A source whose primary intelligence value is:
- strategic trajectory
- convergence analysis
- systemic risk
- long-range implications
- horizon evolution

### Examples

- erosion of trust boundaries
- compression of exploit timelines
- convergence of offensive automation and agents
- institutional dependency risks

### Why This Exists

This category supports:
- strategic synthesis
- long-range analysis
- horizon framing

This category should be used sparingly.

### Key Analytics Dimensions

- horizon relevance
- convergence strength
- strategic insight
- ecosystem significance

---

# Additional Recommended Source Types

These are not mandatory for MVP, but they are strategically valuable additions that improve:
- horizon scanning quality
- strategic synthesis
- long-term analytics
- ecosystem intelligence
- operational foresight

---

## 12. capability_demonstration

### Definition

A demonstrated AI capability that materially changes cyber operational possibilities, even if not yet operationalized in real-world attacks.

This is NOT:
- a benchmark
- a generic research paper
- a real-world incident

This specifically captures:
> “a demonstrated capability that changes what attackers or defenders may soon be able to do.”

### Examples

- autonomous exploit generation
- autonomous phishing personalization
- multi-step agentic compromise demonstrations
- AI systems autonomously completing red-team tasks
- code agents completing exploitation chains

### Why This Exists

Capability demonstrations often precede:
- attacker operationalization
- ecosystem adoption
- governance reaction
- infrastructure redesign

This category captures:
> “what is becoming operationally possible.”

### Key Analytics Dimensions

- autonomy level
- operational completeness
- human supervision required
- reproducibility
- capability delta
- attacker applicability
- defender applicability
- operationalization likelihood

---

## 13. infrastructure_dependency_signal

### Definition

A signal showing growing institutional, governmental, enterprise, or ecosystem dependency on:
- AI infrastructure
- orchestration layers
- AI-integrated workflows
- AI operational systems

### Examples

- enterprise-wide Copilot adoption
- MCP becoming core infrastructure
- AI integrated into SDLC pipelines
- AI-assisted SOC workflows
- agentic workflow integration into operations

### Why This Exists

Attack surface growth is driven not only by vulnerabilities, but by dependency growth.

This category helps explain:
- systemic risk growth
- blast radius expansion
- erosion of trust boundaries
- concentration risk

### Key Analytics Dimensions

- dependency criticality
- infrastructure penetration
- operational reliance
- ecosystem centralization
- trust-boundary expansion
- concentration risk

---

## 14. adversary_adoption_signal

### Definition

Evidence or indicators that adversaries are:
- adopting
- experimenting with
- operationalizing
- scaling

AI capabilities.

This specifically captures:
> “attacker adoption trajectory.”

### Examples

- ransomware groups using AI tooling
- AI-generated phishing at scale
- operational AI malware workflows
- criminal marketplaces advertising AI services
- nation-state experimentation with AI-enabled operations

### Why This Exists

This category is extremely valuable for:
- maturity tracking
- operationalization tracking
- strategic outlooks

It helps answer:
> “Is this still theoretical, or are adversaries genuinely adopting it?”

### Key Analytics Dimensions

- operational maturity
- adoption velocity
- attacker sophistication
- ecosystem diffusion
- commercialization
- repeatability

---

## 15. trust_boundary_shift

### Definition

Signals indicating that AI systems are changing:
- security trust boundaries
- execution assumptions
- authority delegation
- human/system relationships

This is a strategic/systemic intelligence object.

### Examples

- autonomous tool execution
- AI-to-AI interaction trust
- delegated authority to agents
- prompt-to-action workflows
- AI-mediated operational decisions

### Why This Exists

Many future AI-cyber risks are fundamentally:
- trust-boundary problems
- authority-delegation problems
- execution-chain problems

This category captures:
> “structural shifts in how trust and authority operate.”

### Key Analytics Dimensions

- authority delegation
- execution autonomy
- trust compression
- human oversight reduction
- cross-system authority propagation
- systemic dependency

---

# Recommendation for MVP

Do NOT implement all immediately.

Recommended MVP+ additions:

```text
- capability_demonstration
- adversary_adoption_signal
```

These immediately improve:
- horizon quality
- strategic insight generation
- outlook sections
- early signal detection
- slide narrative quality

---

# Recommendation for Later Expansion

Add later when the pipeline matures:

```text
- infrastructure_dependency_signal
- trust_boundary_shift
```

These become much more valuable when:
- analytics mature
- ecosystem tracking improves
- longitudinal trend analysis exists

---

# Removed Source Type

## adjacent_contextual

### Recommendation

Do NOT use this as a source type.

### Why

It becomes:
- a junk drawer
- a low-quality catch-all
- analytics pollution

Instead:
- use relevance tiers
- use archive-only flags
- use scoring
- discard low-value sources earlier

Every retained source should still have a meaningful source type.

---

# Final Recommended Source Types

## Core Operational Types

```text
- vulnerability
- exploit_disclosure
- incident
- threat_intelligence
- research_finding
```

## Defensive / Governance / Ecosystem Types

```text
- defensive_capability
- governance_signal
- ecosystem_signal
- societal_harm_signal
```

## Strategic / Meta Types

```text
- benchmark_evaluation
- strategic_signal
```

## Advanced Horizon / Trajectory Types

```text
- capability_demonstration
- infrastructure_dependency_signal
- adversary_adoption_signal
- trust_boundary_shift
```

## Optional Fallback

```text
- unknown
```

---

# Important Architectural Insight

The source type should answer:

> “What kind of intelligence object is this source?”

NOT:
- what category it belongs to
- what attack vector it describes
- what AI system is affected
- how severe it is

Those belong elsewhere in the pipeline.

---

# Example Separation of Concerns

```text
Source Type:
incident

Main Category:
agentic_ai_threats

Framework Tags:
- excessive_agency
- tool_hijacking
- prompt_to_tool_execution

Attack Vector:
prompt injection

Operational Status:
active_operational_use
```

This separation is what makes the pipeline:
- scalable
- analytically useful
- maintainable
- horizon-scan-ready
- suitable for long-term intelligence synthesis

