"""
Test script to verify /stream SSE endpoint works.

Run: python test_stream.py
"""

import json
import time
import requests


def test_stream():
    """Connect to /stream endpoint and print real-time updates."""
    url = "http://127.0.0.1:8000/stream"
    
    print("Connecting to SSE stream at", url)
    print("=" * 60)
    
    try:
        with requests.get(url, stream=True, timeout=30) as response:
            if response.status_code != 200:
                print(f"ERROR: Got status {response.status_code}")
                return
            
            print("✓ Connected successfully (status 200)")
            print("Listening for updates (press Ctrl+C to stop)...")
            print("=" * 60)
            
            update_count = 0
            last_state = None
            start_time = time.time()
            
            for line in response.iter_lines():
                if not line:
                    continue
                
                line_str = line.decode('utf-8') if isinstance(line, bytes) else line
                
                if line_str.startswith("data: "):
                    try:
                        json_str = line_str[6:]  # Remove "data: " prefix
                        state = json.loads(json_str)
                        update_count += 1
                        
                        # Only print if state changed
                        if state != last_state:
                            elapsed = time.time() - start_time
                            print(f"\n[{elapsed:.1f}s] UPDATE #{update_count}")
                            print(f"  Goal:           {state.get('goal', 'N/A')}")
                            print(f"  Current Step:   {state.get('current_step', 'N/A')}")
                            print(f"  Step Completed: {state.get('step_completed', False)}")
                            print(f"  Message:        {state.get('message', 'N/A')}")
                            print(f"  Suggestion:     {state.get('suggestion', 'N/A')}")
                            last_state = state
                    except json.JSONDecodeError as e:
                        print(f"ERROR parsing JSON: {e}")
                        print(f"Line was: {line_str}")
    
    except requests.exceptions.ConnectionError:
        print("ERROR: Could not connect to server.")
        print("Make sure uvicorn is running: uvicorn api:app --reload")
    except KeyboardInterrupt:
        print("\n\n✓ Test stopped by user")
    except Exception as e:
        print(f"ERROR: {e}")


if __name__ == "__main__":
    test_stream()
