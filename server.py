import asyncio
import websockets
import json
import random
import os
import ssl
from datetime import datetime
import uuid
import logging

# Thiết lập logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('websocket_server')

# Store active game rooms
game_rooms = {}
# Store active connections
connected_clients = {}

class GameRoom:
    def __init__(self, room_id, max_players=4, rounds=3, min_num=1, max_num=100):
        self.id = room_id
        self.players = {}
        self.max_players = max_players
        self.total_rounds = rounds
        self.current_round = 0
        self.min_num = min_num
        self.max_num = max_num
        self.target_number = None
        self.round_active = False
        self.guesses = {}
        self.scores = {}
        self.round_results = []
        self.created_at = datetime.now().isoformat()
    
    def add_player(self, websocket, player_data):
        if len(self.players) >= self.max_players:
            return False
        
        player_id = player_data.get('id', str(uuid.uuid4()))
        self.players[player_id] = {
            'websocket': websocket,
            'username': player_data.get('username', f'Guest_{player_id[:6]}'),
            'avatar': player_data.get('avatar', ''),
            'online': True
        }
        
        # Initialize score for the player
        self.scores[player_id] = 0
        
        return True
    
    def remove_player(self, player_id):
        if player_id in self.players:
            del self.players[player_id]
            if player_id in self.scores:
                del self.scores[player_id]
            if player_id in self.guesses:
                del self.guesses[player_id]
            return True
        return False
    
    def start_new_round(self):
        if self.current_round >= self.total_rounds:
            return False
        
        self.current_round += 1
        self.target_number = random.randint(self.min_num, self.max_num)
        self.round_active = True
        self.guesses = {}
        
        return True
    
    def submit_guess(self, player_id, guess):
        if not self.round_active or player_id not in self.players:
            return False
        
        try:
            guess_value = int(guess)
            if guess_value < self.min_num or guess_value > self.max_num:
                return False
            
            self.guesses[player_id] = guess_value
            
            # Check if all players have submitted their guesses
            if len(self.guesses) == len(self.players):
                return self.end_round()
            
            return True
        except ValueError:
            return False
    
    def end_round(self):
        if not self.round_active:
            return False
        
        self.round_active = False
        
        # Calculate results for this round
        round_result = {
            'round': self.current_round,
            'target_number': self.target_number,
            'guesses': {},
            'differences': {},
            'winner': None,
            'min_difference': float('inf')
        }
        
        # Calculate differences and find the winner
        for player_id, guess in self.guesses.items():
            difference = abs(guess - self.target_number)
            round_result['guesses'][player_id] = guess
            round_result['differences'][player_id] = difference
            
            if difference < round_result['min_difference']:
                round_result['min_difference'] = difference
                round_result['winner'] = player_id
        
        # Update scores
        if round_result['winner']:
            self.scores[round_result['winner']] += 1
        
        self.round_results.append(round_result)
        return round_result
    
    def get_room_state(self):
        return {
            'id': self.id,
            'players': {pid: {k: v for k, v in data.items() if k != 'websocket'} 
                       for pid, data in self.players.items()},
            'max_players': self.max_players,
            'current_round': self.current_round,
            'total_rounds': self.total_rounds,
            'round_active': self.round_active,
            'scores': self.scores,
            'min_num': self.min_num,
            'max_num': self.max_num,
            'created_at': self.created_at
        }

async def broadcast_to_room(room, message):
    """Send a message to all players in a room"""
    if not room or not room.players:
        return
    
    disconnected_players = []
    for player_id, player_data in room.players.items():
        websocket = player_data['websocket']
        try:
            await websocket.send(json.dumps(message))
        except websockets.ConnectionClosed:
            disconnected_players.append(player_id)
    
    # Clean up disconnected players
    for player_id in disconnected_players:
        room.remove_player(player_id)

async def handle_connection(websocket, path):
    """Handle a WebSocket connection"""
    client_id = str(uuid.uuid4())
    connected_clients[client_id] = websocket
    current_room = None
    player_data = {'id': client_id, 'username': f'Guest_{client_id[:6]}'}
    
    logger.info(f"New connection established: {client_id}")
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                action = data.get('action')
                logger.info(f"Received action: {action} from {client_id}")
                
                if action == 'join_room':
                    room_id = data.get('room_id')
                    # Update player data if provided
                    if 'player' in data:
                        player_data.update(data['player'])
                    
                    # Create a new room if not exists
                    if not room_id or room_id not in game_rooms:
                        room_id = str(uuid.uuid4())
                        game_rooms[room_id] = GameRoom(room_id)
                    
                    current_room = game_rooms[room_id]
                    if current_room.add_player(websocket, player_data):
                        # Notify all players about the new player
                        await broadcast_to_room(current_room, {
                            'type': 'player_joined',
                            'player': {k: v for k, v in player_data.items() if k != 'websocket'},
                            'room': current_room.get_room_state()
                        })
                    else:
                        await websocket.send(json.dumps({
                            'type': 'error',
                            'message': 'Room is full'
                        }))
                
                elif action == 'create_room':
                    # Optional room settings
                    max_players = int(data.get('max_players', 4))
                    rounds = int(data.get('rounds', 3))
                    min_num = int(data.get('min_num', 1))
                    max_num = int(data.get('max_num', 100))
                    
                    # Update player data if provided
                    if 'player' in data:
                        player_data.update(data['player'])
                    
                    room_id = str(uuid.uuid4())
                    game_rooms[room_id] = GameRoom(
                        room_id, max_players, rounds, min_num, max_num
                    )
                    current_room = game_rooms[room_id]
                    current_room.add_player(websocket, player_data)
                    
                    await websocket.send(json.dumps({
                        'type': 'room_created',
                        'room': current_room.get_room_state()
                    }))
                
                elif action == 'start_game' and current_room:
                    if len(current_room.players) < 2:
                        await websocket.send(json.dumps({
                            'type': 'error',
                            'message': 'Need at least 2 players to start'
                        }))
                    else:
                        current_room.start_new_round()
                        await broadcast_to_room(current_room, {
                            'type': 'round_started',
                            'round': current_room.current_round,
                            'room': current_room.get_room_state()
                        })
                
                elif action == 'submit_guess' and current_room:
                    guess = data.get('guess')
                    if current_room.submit_guess(client_id, guess):
                        await websocket.send(json.dumps({
                            'type': 'guess_received',
                            'guess': guess
                        }))
                        
                        # If round ended, send results
                        if not current_room.round_active:
                            round_result = current_room.round_results[-1]
                            await broadcast_to_room(current_room, {
                                'type': 'round_ended',
                                'result': round_result,
                                'scores': current_room.scores,
                                'next_round': current_room.current_round < current_room.total_rounds
                            })
                            
                            # If this was the last round, end the game
                            if current_room.current_round >= current_room.total_rounds:
                                # Find the winner(s)
                                max_score = max(current_room.scores.values())
                                winners = [pid for pid, score in current_room.scores.items() 
                                          if score == max_score]
                                
                                await broadcast_to_room(current_room, {
                                    'type': 'game_ended',
                                    'winners': winners,
                                    'scores': current_room.scores,
                                    'rounds': current_room.round_results
                                })
                    else:
                        await websocket.send(json.dumps({
                            'type': 'error',
                            'message': 'Invalid guess or round not active'
                        }))
                
                elif action == 'next_round' and current_room:
                    if current_room.round_active:
                        await websocket.send(json.dumps({
                            'type': 'error',
                            'message': 'Current round still active'
                        }))
                    elif current_room.current_round >= current_room.total_rounds:
                        await websocket.send(json.dumps({
                            'type': 'error',
                            'message': 'Game has ended'
                        }))
                    else:
                        current_room.start_new_round()
                        await broadcast_to_room(current_room, {
                            'type': 'round_started',
                            'round': current_room.current_round,
                            'room': current_room.get_room_state()
                        })
                
                elif action == 'get_rooms':
                    # Return a list of available rooms with basic info
                    rooms_info = []
                    for room_id, room in game_rooms.items():
                        # Only include non-full rooms that haven't completed all rounds
                        if len(room.players) < room.max_players and room.current_round < room.total_rounds:
                            rooms_info.append({
                                'id': room_id,
                                'players': len(room.players),
                                'max_players': room.max_players,
                                'current_round': room.current_round,
                                'total_rounds': room.total_rounds
                            })
                    
                    await websocket.send(json.dumps({
                        'type': 'rooms_list',
                        'rooms': rooms_info
                    }))
                
                elif action == 'leave_room' and current_room:
                    if current_room.remove_player(client_id):
                        await broadcast_to_room(current_room, {
                            'type': 'player_left',
                            'player_id': client_id,
                            'room': current_room.get_room_state()
                        })
                        
                        # If room is empty, remove it
                        if not current_room.players:
                            if current_room.id in game_rooms:
                                del game_rooms[current_room.id]
                        
                        current_room = None
            
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON from {client_id}")
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': 'Invalid JSON format'
                }))
    
    except websockets.ConnectionClosed:
        logger.info(f"Connection closed for {client_id}")
    except Exception as e:
        logger.error(f"Error handling connection: {str(e)}")
    finally:
        # Clean up when client disconnects
        if client_id in connected_clients:
            del connected_clients[client_id]
        
        if current_room:
            current_room.remove_player(client_id)
            await broadcast_to_room(current_room, {
                'type': 'player_left',
                'player_id': client_id,
                'room': current_room.get_room_state()
            })
            
            # If room is empty, remove it
            if not current_room.players and current_room.id in game_rooms:
                del game_rooms[current_room.id]

async def main():
    # Glitch provides port in environment variable
    port = int(os.environ.get("PORT", 8765))
    
    # Không cần SSL trên Glitch vì họ đã xử lý HTTPS
    server = await websockets.serve(
        handle_connection,
        "0.0.0.0",  
        port
    )
    
    logger.info(f"WebSocket server started at ws://0.0.0.0:{port}")
    
    # Clean up empty rooms periodically
    async def cleanup_empty_rooms():
        while True:
            to_remove = []
            for room_id, room in game_rooms.items():
                if not room.players:
                    to_remove.append(room_id)
            
            for room_id in to_remove:
                del game_rooms[room_id]
                logger.info(f"Removed empty room: {room_id}")
            
            await asyncio.sleep(300)  # Check every 5 minutes
    
    asyncio.create_task(cleanup_empty_rooms())
    
    await server.wait_closed()

if __name__ == "__main__":
    logger.info("Starting WebSocket server...")
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {str(e)}")
        raise 