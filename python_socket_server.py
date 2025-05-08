import asyncio
import websockets
import json
import os

# Port nội bộ cho Python WebSocket server, KHÔNG PHẢI process.env.PORT của Node.js
PYTHON_WS_PORT = int(os.environ.get('PYTHON_WS_PORT', 8001))

connected_clients = set()

async def handler(websocket, path):
    global connected_clients
    connected_clients.add(websocket)
    client_address = websocket.remote_address
    print(f"Python WS: Client connected from {client_address}")

    try:
        async for message_str in websocket:
            print(f"Python WS: Received from {client_address}: {message_str}")
            
            # Xử lý message ở đây (ví dụ: parse JSON, logic game)
            try:
                data = json.loads(message_str)
                # Ví dụ: Gửi lại cho tất cả client khác
                # (Trong game thực tế, bạn sẽ có logic phòng chơi, trạng thái game...)
                
                # Tạo message để gửi đi
                response_data = {
                    "sender": str(client_address), # Hoặc ID người chơi nếu có
                    "original_message": data,
                    "server_response": "Message processed by Python!"
                }
                response_str = json.dumps(response_data)

                # Gửi lại cho tất cả client (broadcast)
                # Lưu ý: không gửi lại cho chính client gửi tin nhắn này trong một số trường hợp
                # clients_to_send = [client for client in connected_clients if client != websocket]
                # if clients_to_send:
                #     await asyncio.wait([client.send(response_str) for client in clients_to_send])

                # Hoặc gửi cho tất cả, bao gồm cả người gửi
                for client in connected_clients:
                    await client.send(response_str)
                
                print(f"Python WS: Broadcasted: {response_str}")

            except json.JSONDecodeError:
                print(f"Python WS: Received non-JSON message: {message_str}")
                await websocket.send(json.dumps({"error": "Invalid JSON format"}))
            except Exception as e:
                print(f"Python WS: Error processing message: {e}")
                await websocket.send(json.dumps({"error": "Server error during message processing"}))

    except websockets.exceptions.ConnectionClosedOK:
        print(f"Python WS: Client {client_address} disconnected normally.")
    except websockets.exceptions.ConnectionClosedError as e:
        print(f"Python WS: Client {client_address} disconnected with error: {e}")
    except Exception as e:
        print(f"Python WS: An unexpected error occurred with client {client_address}: {e}")
    finally:
        connected_clients.remove(websocket)
        print(f"Python WS: Client {client_address} removed from connected list.")

async def main():
    # Lắng nghe trên 0.0.0.0 để chấp nhận kết nối từ proxy (Node.js)
    # trong cùng container/máy ảo.
    async with websockets.serve(handler, "0.0.0.0", PYTHON_WS_PORT):
        print(f"Python WebSocket server started on ws://0.0.0.0:{PYTHON_WS_PORT}")
        await asyncio.Future()  # Chạy mãi mãi

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Python WebSocket server stopping...")