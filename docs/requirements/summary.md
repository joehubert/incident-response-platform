# Project Summary: Incident Response Platform

Welcome to the team! This document provides a high-level overview of the AI-Powered Incident Response Platform.

## 1. Project Goal

The primary goal of this platform is to **automate the detection, investigation, and root-cause analysis of software incidents**. It is designed to reduce the mean time to resolution (MTTR) by providing engineers with a comprehensive, AI-driven summary of what went wrong and why.

## 2. Core Architecture

The platform is built on a microservices-oriented architecture within a single Node.js application. The core logic is divided into several key services:

-   **Detection Service**: Continuously monitors metrics from **Datadog**. It calculates historical baselines for these metrics and detects anomalies based on pre-configured thresholds. When an anomaly is detected, it creates an "incident" in the database, which kicks off the workflow.
-   **Investigation Service**: Once an incident is created, this service gathers evidence to determine the potential cause. It uses a tiered strategy:
    -   **Tier 1 (Deployment-based)**: If a recent deployment is detected in Datadog, it focuses the investigation on the specific commit SHA.
    -   **Tier 2 (Stacktrace-based)**: If a stack trace is available in the incident, it identifies the file paths and investigates commits that recently modified those files.
    -   **Tier 3 (Temporal-based)**: As a fallback, it looks at all recent commits within a time window around the incident.
    It pulls data from **GitLab** (commits, diffs), **Sourcegraph** (code search), and a **read-only database connection** to build a complete evidence bundle.
-   **Analysis Service**: This service takes the evidence bundle and uses the **Google Gemini** large language model (LLM) to perform a root-cause analysis. It generates a structured JSON object containing a hypothesis, confidence score, recommended actions, and a human-readable summary. The orchestration of this process is managed by **LangGraph**.
-   **Notification Service**: After the analysis is complete, this service formats a rich, actionable message and sends it to the appropriate engineering team via **Microsoft Teams**.

## 3. Technology Stack

-   **Backend**: Node.js, Express.js
-   **Language**: TypeScript
-   **Database**: Microsoft SQL Server
-   **Caching**: Redis (for baselines, API responses, and LLM results)
-   **Testing**: Jest (for unit and integration tests)
-   **Linting & Formatting**: ESLint, Prettier
-   **Deployment**: Docker, Kubernetes (manifests provided in `k8s/`)
-   **CI/CD**: GitLab CI (`.gitlab-ci.yml`)

## 4. Key Integrations

The platform connects to several external services. API clients for each are located in `src/lib/clients/`:

-   **Datadog**: For metrics and anomaly detection.
-   **GitLab**: For investigating code changes and commits.
-   **Google Gemini**: For AI-powered analysis.
-   **Sourcegraph**: For code search and understanding code structure.
-   **Microsoft Teams**: For sending notifications.

## 5. Project Structure

-   `src/`: The main application source code.
    -   `services/`: Contains the core business logic for the services described above.
    -   `lib/clients/`: Manages all connections to external APIs.
    -   `lib/utils/`: Shared utilities like logging, error handling, and metrics.
    -   `api/`: Defines the public-facing REST API (routes, controllers, middleware).
    -   `config/`: Application configuration management using `convict`.
    -   `workflows/`: LangGraph workflow definitions.
-   `docs/requirements/`: Detailed, prescriptive requirements for each part of the application. This is a great place to get a deep understanding of a specific service.
-   `tests/`: Contains all unit and integration tests.
-   `k8s/`: Kubernetes manifests for deployment.
-   `docker/`: Docker configuration.

## 6. Getting Started

1.  **Install Dependencies**: The project uses `pnpm` as a package manager.
    ```bash
    npm install -g pnpm
    pnpm install
    ```
2.  **Environment Setup**: Copy the `.env.example` file to `.env` and fill in the required API keys and connection details for the various services.
3.  **Run Database Migrations**:
    ```bash
    pnpm run migrate
    ```
4.  **Run the development server**:
    ```bash
    pnpm run dev
    ```
5.  **Run tests**:
    ```bash
    pnpm run test
    ```

The server will start on the port defined in your configuration (default is 3000).
