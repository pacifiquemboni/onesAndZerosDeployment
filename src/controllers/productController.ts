import { Request, Response } from 'express';
import cloudinary from '../helps/cloudinaryConfig';
import { db } from '../database/models/index';
import { verify } from 'crypto';
import { authenticateToken } from '../config/jwt.token';
import ProductService from '../services/productService';
import CollectionService from '../services/collectionService';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

import { validateEmail, validatePassword } from '../validations/validations';
import path from 'path';
import { Console, log } from 'console';
import { logger } from 'sequelize/types/utils/logger';
import upload from '../middleware/multer';
import { UploadApiResponse, ResourceType } from 'cloudinary';
import { where } from 'sequelize';
import { addCollectionEmitter } from '../utils/notifications/addCollectionHandler';
import { addProductEmitter } from '../utils/notifications/addProductHandler';
import { updateProductEmitter } from '../utils/notifications/updateProductHandler';
import { saveCollectionToDbEmitter } from '../utils/notifications/saveCollectionToDbHandler';
import { saveStatusToDbEmitter } from '../utils/notifications/saveStatusToDbHandler';
import { saveProductToDbEmitter } from '../utils/notifications/saveProductToDbHandler';

export interface User {
  role: string;
  userId: string;
  userproductId: string;
  email: string;
  firstName: string;
}

export interface CustomRequest extends Request {
  user?: User;
  files?: any;
}

export async function createCollection(req: CustomRequest, res: Response) {
  try {
    const userInfo = req.user;
    const { name } = req.body;
    const sellerId = userInfo?.userId;

    if (!name || !sellerId) {
      return res.status(400).json({ error: 'Name and sellerId are required' });
    }

    const user = await db.User.findByPk(sellerId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingCollection = await db.Collection.findOne({
      where: {
        name: name,
        sellerId: sellerId,
      },
    });

    if (existingCollection) {
      return res.status(400).json({ error: 'Collection already exists' });
    }

    const collection = await db.Collection.create({
      name: name,
      sellerId: sellerId,
    });

    addCollectionEmitter.emit('add', {
      userId: req.user?.userId,
      firstName: req.user?.firstName,
      email: req.user?.email,
      collectionName: collection.name,
      created: collection.createdAt,
    });

    saveCollectionToDbEmitter.emit('save', {
      userId: req.user?.userId,
      collectionName: collection.name,
    });

    return res.status(201).json(collection);
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export async function getUserCollections(req: CustomRequest, res: Response) {
  try {
    const userInfo = req.user;
    const sellerId = userInfo?.userId;
    if (!sellerId) {
      return res.status(400).json({ error: 'sellerId is required' });
    }
    const user = await db.User.findByPk(sellerId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const collectionList = await db.Collection.findAll({
      where: { sellerId: sellerId },
    });
    if (!collectionList.length) {
      return res.status(200).json([]);
    }

    return res.status(200).json(collectionList);
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export async function deleteCollection(req: CustomRequest, res: Response) {
  try {
    const collectionId = req.params.collectionid;
    const userInfo = req.user;
    const sellerId = userInfo?.userId;

    if (!collectionId) {
      return res.status(400).json({ error: 'CollectionId is required' });
    }
    if (!sellerId) {
      return res.status(400).json({ error: 'sellerId is required' });
    }
    const user = await db.User.findByPk(sellerId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const collection = await db.Collection.findOne({
      where: { sellerId: sellerId, id: collectionId },
    });
    if (!collection) {
      return res.status(404).json({
        error: 'Collection not found',
      });
    }
    if (collection.id === collectionId) {
      await collection.destroy();
      res.status(200).json({
        message: 'Collection deleted Successfully.',
      });
    }
  } catch (error) {
    return res.status(500).json({ message: 'Internal Server Error', error });
  }
}
export async function getProductsPerCollection(
  req: CustomRequest,
  res: Response,
) {
  try {
    const collectionId = req.params.collectionid;
    if (!collectionId) {
      return res.status(400).json({ message: 'collection id is required' });
    }
    const collection = await db.Collection.findByPk(collectionId);
    const exit = Boolean(collection);
    if (!exit) {
      return res
        .status(404)
        .json({ error: 'Collection with the given id does not exist' });
    }
    let Products;
    Products = await db.Product.findAll({
      where: { collectionId: collectionId },
    });

    if (!Products.length) {
      return res.status(200).json({
        message: 'collection is empty',
        data: [],
      });
    }
    return res.status(200).json({
      message: 'Products retrieved successfully',
      data: Products,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: 'Internal Server Error', error: 'Server error' });
  }
}

export async function createProduct(req: CustomRequest, res: Response) {
  try {
    const userInfo = req.user;
    const { collectionId } = req.params;
    const { name, price, discount, quantity, expiryDate, bonus, description } =
      req.body;

    if (!name || !price || !quantity || !description) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const fileImages = req.files;
    if (!fileImages || fileImages.length === 0) {
      return res.status(400).json({ message: 'No images given' });
    }

    const collection = await db.Collection.findByPk(collectionId);
    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }

    const existingProduct = await db.Product.findOne({
      where: {
        name: name,
        collectionId: collectionId,
      },
    });

    if (existingProduct) {
      return res.status(400).json({
        message: 'Product already exists in this collection',
        existingProduct,
      });
    }

    if (fileImages.length < 4 || fileImages.length > 8) {
      return res
        .status(400)
        .json({ error: 'Product must have between 4 to 8 images' });
    }

    let uploadedImageUrls: any = [];
    for (let i = 0; i < fileImages.length; i++) {
      const file = fileImages[i];
      const base64String = file.buffer.toString('base64');
      const fileBase64 = `data:${file.mimetype};base64,${base64String}`;
      const result = await cloudinary.uploader.upload(fileBase64);
      uploadedImageUrls.push(result.secure_url);
    }

    const product = await db.Product.create({
      name,
      price,
      quantity,
      discount,
      expiryDate: expiryDate || null,
      bonus: bonus || null,
      images: uploadedImageUrls,
      collectionId,
      description,
    });

    addProductEmitter.emit('add', { product, userInfo });
    saveProductToDbEmitter.emit('save', { product, userInfo });
    return res
      .status(201)
      .json({ message: 'Product added successfully', product });
  } catch (error) {
    return res.status(500).json({ message: 'Internal Server Error', error });
  }
}

export async function getProducts(req: any, res: Response) {
  const products = await db.Product.findAll({
    where: {
      expired: false,
    },
  });
  if (products.length <= 0) {
    return res.status(404).json({ message: 'no Products in store' });
  }
  return res.status(200).json(products);
}

export class ProductController {
  static async getAllFromMine(req: Request, res: Response) {
    try {
      const sellerId = req.params.id;
      const collections = await db.Collection.findAll({
        where: { sellerId },
      });
      if (collections.length === 0) {
        return res
          .status(404)
          .json({ message: 'No collections found for the specified user.' });
      }
      const collectionIds = collections.map(
        (collection: { id: any }) => collection.id,
      );
      const products = await db.Product.findAll({
        where: {
          collectionId: collectionIds,
        },
      });
      if (products.length === 0) {
        return res
          .status(404)
          .json({ message: "No products found in the user's collections." });
      }

      return res.status(200).json(products);
    } catch (error) {
      return res
        .status(500)
        .json({ message: 'An error occurred while fetching products.' });
    }
  }

  // static async getAvailableProduct(req: Request, res: Response) {
  //   try {
  //     const allAvailableProducts = await db.Product.findAll({
  //       where: {
  //         isAvailable: true,
  //       },
  //     });
  //     if (!allAvailableProducts.length) {
  //       return res
  //         .status(404)
  //         .json({ message: 'No available products in our store' });
  //     }
  //     res.status(200).json({
  //       message: 'List of available products in our store',
  //       allAvailableProducts,
  //     });
  //   } catch (error) {
  //     return res.status(500).json({ message: 'Internal Server Error' });
  //   }
  // }
  static async getAvailableProduct(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const productPerPage = 10;
      const offset = (page - 1) * productPerPage;

      const { count, rows: allAvailableProducts } =
        await db.Product.findAndCountAll({
          where: {
            isAvailable: true,
          },
          limit: productPerPage,
          offset: offset,
        });

      if (!allAvailableProducts.length) {
        return res.status(200).json([]);
      }

      const totalPages = Math.ceil(count / productPerPage);

      const nextPage = page < totalPages ? page + 1 : null;
      const prevPage = page > 1 ? page - 1 : null;

      res.status(200).json({
        message: 'List of available products in our store',
        data: allAvailableProducts,
        pagination: {
          totalProducts: count,
          totalPages,
          productPerPage,
          currentPage: page,
          nextPage: nextPage
            ? `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}?page=${nextPage}`
            : null,
          prevPage: prevPage
            ? `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}?page=${prevPage}`
            : null,
        },
      });
    } catch (error) {
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  }

  static async updateSingleProduct(req: CustomRequest, res: Response) {
    try {
      const { productId } = req.params;
      if (!productId) {
        return res
          .status(400)
          .json({ message: 'Product productId is required' });
      }

      const product = await db.Product.findOne({ where: { productId } });

      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      const newStatus = !product.isAvailable;

      await db.Product.update(
        { isAvailable: newStatus },
        { where: { productId } },
      );

      const productStatus = newStatus ? 'Available' : 'Not available';
      const userInfo = req.user;

      updateProductEmitter.emit('update', { product, userInfo, productStatus });
      saveStatusToDbEmitter.emit('save', { product, userInfo, productStatus });

      res.status(200).json({
        message: `Product is successfully marked as ${newStatus ? 'available' : 'unavailable'}`,
        isAvailable: newStatus,
      });
    } catch (error) {
      res.status(500).json({ message: 'Internal Server Error' });
    }
  }

  static async getSingleProduct(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const singleProduct = await db.Product.findByPk(id);
      return res.status(200).json({
        status: 'success',
        message: 'Retreived Product',
        data: singleProduct,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({ status: 'fail', message: 'Internal server error' });
    }
  }

  static async updateProduct(req: Request, res: Response) {
    try {
      const { productId } = req.params;
      const { name, description, category, bonus, price, quantity, discount } =
        req.body;
      const singleProduct = await db.Product.findOne({
        where: { productId },
      });
      if (!singleProduct) {
        return res.status(404).json({
          status: 'error',
          message: 'Product not found',
        });
      }
      if (
        !name &&
        !description &&
        !category &&
        !bonus &&
        !price &&
        !quantity &&
        !discount &&
        (!req.files || req.files.length === 0)
      ) {
        return res.status(400).json({
          status: 'error',
          message:
            'At least one field (name, description, category, bonus, price, quantity, discount) or image upload is required',
        });
      }

      if (name) {
        singleProduct.name = name;
      }
      if (description) {
        singleProduct.description = description;
      }
      if (category) {
        singleProduct.category = category;
      }
      if (bonus) {
        singleProduct.bonus = bonus;
      }
      if (price) {
        singleProduct.price = price;
      }
      if (quantity) {
        singleProduct.quantity = quantity;
      }
      if (discount) {
        singleProduct.discount = discount;
      }

      if (req.files && Array.isArray(req.files)) {
        const resourceType = 'image';

        if (req.files.length > 9) {
          return res.status(400).json({
            status: 'error',
            message:
              'You reached the maximum number of images a product can have',
          });
        }

        const uploadPromises = req.files.map((file) =>
          cloudinary.uploader.upload(file.path, {
            resource_type: resourceType,
          }),
        );

        const results = await Promise.all(uploadPromises);
        const uploadedUrls = results.map((result) => result.secure_url);

        // Add the new images to the existing images
        singleProduct.images = [...singleProduct.images, ...uploadedUrls];
      }

      singleProduct.updatedAt = new Date();

      await singleProduct.save();

      return res.status(200).json({
        status: 'success',
        message: 'Product updated successfully',
        data: singleProduct,
      });
    } catch (error: any) {
      return res.status(500).json({
        status: 'error',
        message: 'Internal Server Error',
        error: error.message,
      });
    }
  }

  static async removeProductImage(req: Request, res: Response) {
    const { productId, images } = req.body;
    if (!productId || !images) {
      return res.status(400).json({
        status: 'Bad Request',
        error: 'productId and images fields are required',
      });
    }
    try {
      const product = await db.Product.findOne({ where: { productId } });

      if (!product) {
        return res.status(404).json({
          status: 'Not Found',
          error: 'Product not found',
        });
      }

      if (!Array.isArray(product.images)) {
        return res.status(400).json({
          status: 'Bad Request',
          error: 'Invalid image_url array in database',
        });
      }

      const updatedImages = product.images.filter(
        (url: string) =>
          url.trim().toLowerCase() !== images.trim().toLowerCase(),
      );

      if (updatedImages.length === product.images.length) {
        return res.status(400).json({
          status: 'Bad Request',
          error: 'Image URL not found in product',
        });
      }
      product.images = updatedImages;
      await product.save();

      return res.status(200).json({
        status: 'Success',
        message: 'Image removed successfully',
        data: product,
      });
    } catch (err: any) {
      return res.status(500).json({
        status: 'Internal Server Error',
        error: err.message,
      });
    }
  }

  static async deleteProduct(req: any, res: any) {
    const { id } = req.params;

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not defined ');
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { userId, role } = decoded;

    if (role !== 'seller') {
      return res
        .status(403)
        .json({ error: 'You must be a seller to delete a product.' });
    }

    const product = await ProductService.getProductById(id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const collection = await CollectionService.getCollectionById(
      product.collectionId,
    );

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found.' });
    }

    if (collection.sellerId !== userId) {
      return res
        .status(403)
        .json({ error: 'You can only delete your own products.' });
    }

    const deletedProduct = await ProductService.deleteProduct(id);

    return res.status(200).json({
      message: 'Product deleted successfully.',
      product: deletedProduct,
    });
  }
}
