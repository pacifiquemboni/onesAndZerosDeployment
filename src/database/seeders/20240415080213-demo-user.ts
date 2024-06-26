'use strict';
import dotenv from 'dotenv';
dotenv.config();
const { v4: uuid } = require('uuid');
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface: any, Sequelize: any) {
    await queryInterface.bulkInsert(
      'Users',
      [
        {
          userId: uuid(),
          firstName: 'christian',
          lastName: 'Ishimwe',
          email: 'christianinja3@gmail.com',
          password: 'Rukundo@12',
          role: 'seller',
          isVerified: false,
        },
        {
          userId: uuid(),
          firstName: 'celse',
          lastName: 'Nshuti',
          email: 'nshuticelestin@gmail.com',
          password: 'Rukundo@12',
          isVerified: false,
          role: 'seller',
        },
      ],
      {},
    );
  },

  async down(queryInterface: any, Sequelize: any) {
    /**
     * Add commands to revert seed here.
     *
     * Example:
     */
    await queryInterface.bulkDelete('Users', null, {});
  },
};
