import os
import json
from pydantic import BaseModel, Field
from typing import List
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

class Step(BaseModel):
    name: str = Field(description="The name of the action/step to be performed. Keep it short and concise like 'open laptop'.")
    requires: List[str] = Field(description="A list of exact 'name' strings of previous steps that must be completed before this step. If no prerequisites exist, return an empty array.")

class SOP(BaseModel):
    steps: List[Step]

def main():
    # Load API key from .env file
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY is not set in the environment or .env file.")
        return

    client = OpenAI(api_key=api_key)

    # Read the SOP text file
    try:
        with open("sop2.txt", "r", encoding="utf-8") as file:
            sop_text = file.read()
    except FileNotFoundError:
        print("Error: sop2.txt not found in the current directory.")
        return

    prompt = f"""
You are an expert at parsing Standard Operating Procedure (SOP) documents.
Read the following SOP text and convert it into a structured sequence of actions/steps.
For each action, extract:
1. 'name': A short, clear name for the action (e.g., "visual inspection", "dry surface cleaning").
2. 'requires': An array of strings containing the exact 'name's of the previous steps that must be completed before this step can begin. For example, if "type on laptop" requires "open laptop", the array would be ["open laptop"]. If a step has no dependencies or is the very first step, return an empty array [].

SOP Text:
---
{sop_text}
---
"""

    print("Sending request to OpenAI...")
    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful assistant designed to output a JSON array of dependent steps."},
                {"role": "user", "content": prompt}
            ],
            response_format=SOP,
        )

        sop_structured = completion.choices[0].message.parsed
        
        # Print the structured output as formatted JSON
        print(sop_structured.model_dump_json(indent=2))

    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
