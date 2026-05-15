from __future__ import annotations

import os

import httpx

from .schemas import RouteOption


def build_explanation(route: RouteOption, baseline: RouteOption | None = None) -> str:
    if os.getenv("ENABLE_LLM_EXPLANATIONS", "true").lower() == "true":
        generated = _try_llm_explanation(route, baseline)
        if generated:
            return generated

    mode_sequence = " + ".join(dict.fromkeys(leg.mode.value for leg in route.legs))
    if baseline and route.carbon_saving_percent > 0:
        return (
            f"The {route.strategy} option uses {mode_sequence} and cuts estimated emissions by "
            f"{route.carbon_saving_percent:.1f}% versus the highest-carbon option, while delivering in "
            f"{route.total_time_hr:.1f} hours at an estimated ${route.total_cost_usd:,.0f}."
        )
    return (
        f"The {route.strategy} option uses {mode_sequence}, producing "
        f"{route.total_emissions_kg:.1f} kg CO2e over {route.total_distance_km:.0f} km with "
        f"an estimated transit time of {route.total_time_hr:.1f} hours."
    )


def build_tradeoffs(route: RouteOption, fastest: RouteOption, greenest: RouteOption, cheapest: RouteOption) -> list[str]:
    tradeoffs: list[str] = []
    if route.route_id != fastest.route_id:
        tradeoffs.append(f"{route.total_time_hr - fastest.total_time_hr:.1f} hours slower than the fastest option")
    else:
        tradeoffs.append("Fastest available option")

    if route.route_id != greenest.route_id:
        tradeoffs.append(f"{route.total_emissions_kg - greenest.total_emissions_kg:.1f} kg CO2e above the lowest-carbon option")
    else:
        tradeoffs.append("Lowest-carbon available option")

    if route.route_id != cheapest.route_id:
        tradeoffs.append(f"${route.total_cost_usd - cheapest.total_cost_usd:,.0f} above the lowest-cost option")
    else:
        tradeoffs.append("Lowest-cost available option")

    return tradeoffs


def _try_llm_explanation(route: RouteOption, baseline: RouteOption | None) -> str | None:
    provider = os.getenv("LLM_PROVIDER", "ollama").lower()
    prompt = _explanation_prompt(route, baseline)
    if provider == "ollama":
        return _try_ollama_explanation(prompt)
    if provider in {"openai", "openai-compatible"} and os.getenv("OPENAI_API_KEY"):
        return _try_openai_explanation(prompt)
    return None


def _explanation_prompt(route: RouteOption, baseline: RouteOption | None) -> str:
    mode_sequence = " + ".join(dict.fromkeys(leg.mode.value for leg in route.legs))
    baseline_text = ""
    if baseline:
        baseline_text = (
            f" Baseline emissions: {baseline.total_emissions_kg:.1f} kg, "
            f"time: {baseline.total_time_hr:.1f} hr, cost: {baseline.total_cost_usd:.0f} USD."
        )
    return (
        "Explain this freight route recommendation in one concise enterprise-friendly sentence. "
        "Focus on carbon, cost, time, and the main tradeoff. "
        f"Strategy: {route.strategy}. Modes: {mode_sequence}. "
        f"Emissions: {route.total_emissions_kg:.1f} kg CO2e. "
        f"Time: {route.total_time_hr:.1f} hr. Cost: {route.total_cost_usd:.0f} USD."
        f"{baseline_text}"
    )


def _try_ollama_explanation(prompt: str) -> str | None:
    base_url = os.getenv("OLLAMA_BASE_URL", os.getenv("LLM_BASE_URL", "http://127.0.0.1:11434")).rstrip("/")
    model = os.getenv("OLLAMA_MODEL", os.getenv("LLM_MODEL", "llama3.1:8b"))
    timeout = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "20"))
    try:
        response = httpx.post(
            f"{base_url}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": float(os.getenv("LLM_TEMPERATURE", "0.1"))},
            },
            timeout=timeout,
        )
        response.raise_for_status()
        return response.json().get("response", "").strip() or None
    except Exception:
        return None


def _try_openai_explanation(prompt: str) -> str | None:
    try:
        from openai import OpenAI

        client = OpenAI()
        response = client.responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
            input=prompt,
        )
        return response.output_text.strip()
    except Exception:
        return None
