import { Request, Response } from 'express';
import { db } from '../database/models';

export interface User {
  role: string;
  userId: string;
  username: string;
}

export interface CustomRequest extends Request {
  user?: User;
}

export interface IChat {
  message: string;
  userId: string;
  username: string;
  timestamp: string;
}

interface IRoom {
  room: string;
  chats: IChat[];
}

async function createRoom(room: string): Promise<IRoom> {
  const newRoom = await db.Chat.create({ room, chats: [] });
  return newRoom;
}

async function getChats(room: string): Promise<IRoom | null> {
  let chats = await db.Chat.findOne({ where: { room } });
  if (!chats) {
    chats = await createRoom(room);
  }
  return chats;
}

export async function findChats(req: Request, res: Response): Promise<void> {
  try {
    const chats = await getChats('public');
    if (chats) {
      res.status(200).json(chats.chats);
    } else {
      res.status(404).json({ message: 'Room not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'There is server error' });
  }
}

export async function addChat(
  req: CustomRequest,
  res: Response,
): Promise<void> {
  try {
    const room = 'public';
    const message = req.body.message;
    const userId = req?.user?.userId;
    const username = req?.user?.username;
    console.log('our user', room, message, userId, username);
    if (!message || !userId || !username) {
      res.status(400).json({ message: 'Invalid chat data' });
      return;
    }

    const now = new Date();
    const timestamp = now.toISOString();

    const chat: IChat = {
      message,
      userId,
      username,
      timestamp,
    };

    const chats = await getChats(room);
    if (chats) {
      chats.chats.push(chat);
      await db.Chat.update({ chats: chats.chats }, { where: { room } });
      res.status(201).json({ chats: chats.chats });
    } else {
      res.status(500).json({ message: 'Failed to update chat' });
    }
  } catch (error) {
    res.status(500).json({ message: 'There is a server error' });
  }
}
