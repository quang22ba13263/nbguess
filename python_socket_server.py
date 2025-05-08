import asyncio
import websockets
import json
import os
import sys

# Port for Python WebSocket server
PYTHON_WS_PORT = int(os.environ.get('PYTHON_WS_PORT', 8001))

# Print startup message
print(f"Python WebSocket starting on port {PYTHON_WS_PORT}", file=sys.stderr)
print(f"Python version: {sys.version}", file=sys.stderr)

connected_clients = set()

async def handler(websocket, path):
    global connected_clients
    connected_clients.add(websocket)
    client_address = websocket.remote_address
    print(f"Python WS: Client connected from {client_address}", file=sys.stderr)

    try:
        async for message_str in websocket:
            print(f"Python WS: Received from {client_address}: {message_str}", file=sys.stderr)
            
            # Process message here (example: parse JSON, game logic)
            try:
                data = json.loads(message_str)
                # Example: Send back to all other clients
                # (In a real game, you would have room logic, game state...)
                
                # Create message to send
                response_data = {
                    "sender": str(client_address), # Or player ID if available
                    "original_message": data,
                    "server_response": "Message processed by Python!"
                }
                response_str = json.dumps(response_data)

                # Send to all clients (broadcast)
                # Note: don't send back to the client that sent this message in some cases
                # clients_to_send = [client for client in connected_clients if client != websocket]
                # if clients_to_send:
                #     await asyncio.wait([client.send(response_str) for client in clients_to_send])

                # Or send to all, including the sender
                for client in connected_clients:
                    await client.send(response_str)
                
                print(f"Python WS: Broadcasted: {response_str}", file=sys.stderr)

            except json.JSONDecodeError:
                print(f"Python WS: Received non-JSON message: {message_str}", file=sys.stderr)
                await websocket.send(json.dumps({"error": "Invalid JSON format"}))
            except Exception as e:
                print(f"Python WS: Error processing message: {e}", file=sys.stderr)
                await websocket.send(json.dumps({"error": "Server error during message processing"}))

    except websockets.exceptions.ConnectionClosedOK:
        print(f"Python WS: Client {client_address} disconnected normally.", file=sys.stderr)
    except websockets.exceptions.ConnectionClosedError as e:
        print(f"Python WS: Client {client_address} disconnected with error: {e}", file=sys.stderr)
    except Exception as e:
        print(f"Python WS: An unexpected error occurred with client {client_address}: {e}", file=sys.stderr)
    finally:
        connected_clients.remove(websocket)
        print(f"Python WS: Client {client_address} removed from connected list.", file=sys.stderr)

async def main():
    # Listen on 0.0.0.0 to accept connections from the proxy (Node.js)
    # in the same container/VM
    print(f"Python WebSocket server starting up on port {PYTHON_WS_PORT}...", file=sys.stderr)
    
    try:
        async with websockets.serve(handler, "0.0.0.0", PYTHON_WS_PORT):
            print(f"Python WebSocket server started successfully on ws://0.0.0.0:{PYTHON_WS_PORT}", file=sys.stderr)
            await asyncio.Future()  # Run forever
    except Exception as e:
        print(f"Error starting WebSocket server: {e}", file=sys.stderr)
        raise

if __name__ == "__main__":
    try:
        print("Starting Python WebSocket server...", file=sys.stderr)
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Python WebSocket server stopping due to keyboard interrupt...", file=sys.stderr)
    except Exception as e:
        print(f"Fatal error in Python WebSocket server: {e}", file=sys.stderr)
        sys.exit(1)