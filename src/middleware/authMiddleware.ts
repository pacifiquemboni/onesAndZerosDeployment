import { Request, Response, NextFunction } from 'express';
import { db } from '../database/models';
import jwt from 'jsonwebtoken';

export default class authMiddleware {
  static verifyToken = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authorization = req.headers['authorization'];
      if (!authorization) {
        (req as any).user = null;
        return next();
      }

      const token = authorization.split(' ')[1];
      if (!token) {
        (req as any).user = null;
        return next();
      }

      const payload: any = jwt.verify(token, process.env.JWT_SECRET!);
      const existingUser = await db.User.findOne({
        where: {
          userId: payload.userId,
        },
      });

      if (!existingUser) {
        (req as any).user = null;
        return next();
      }
      (req as any).user = existingUser.dataValues;
      next();
    } catch (error: any) {
      (req as any).user = null;
      return next();
    }
  };

  static isAuthenticated(req: Request, res: Response, next: NextFunction) {
    if (!(req as any).user) {
      return res.status(401).json({ message: 'User is not authenticated' });
    }
    next();
  }

  static checkRole(role: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      let user = (req as any).user;
      if (user.role !== role) {
        return res.status(401).json({ message: 'User is not authorized' });
      }
      next();
    };
  }
}

export { authMiddleware };
