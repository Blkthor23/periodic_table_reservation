const service = require("./tables.service");
const reservationsService = require("../reservations/reservations.service");
const asyncErrorBoundary = require("../errors/asyncErrorBoundary");

function bodyDataHas(propertyName) {
  return function (req, res, next) {
    const { data = {} } = req.body;
    if (data[propertyName]) {
      return next();
    }
    next({
      status: 400,
      message: `Table must include a ${propertyName}`,
    });
  };
}

function tableNameIsValidLength(req, res, next) {
  const {
    data: { table_name },
  } = req.body;
  if (table_name.length < 2) {
    return next({
      status: 400,
      message: "table_name must be at lest 2 characters",
    });
  }
  next();
}

function capacityIsValidNumber(req, res, next) {
  const {
    data: { capacity },
  } = req.body;
  if (capacity <= 0 || !Number.isInteger(capacity)) {
    return next({
      status: 400,
      message: "capacity must be an integer greater than 0",
    });
  }
  next();
}

async function tableExists(req, res, next) {
  const { table_id } = req.params;

  const table = await service.read(table_id);
  if (table) {
    res.locals.table = table;
    return next();
  }
  return next({ status: 404, message: `Table ${table_id} cannot be found.` });
}

async function checkReservationFromBody(req, res, next) {
  const { reservation_id } = req.body.data;

  const reservation = await reservationsService.read(reservation_id);

  if (reservation) {
    res.locals.reservation = reservation;
    return next();
  }
  return next({
    status: 404,
    message: `Reservation ${reservation_id} cannot be found.`,
  });
}

async function checkReservationFromTable(req, res, next) {
  const { reservation_id } = res.locals.table;

  const reservation = await reservationsService.read(reservation_id);

  if (reservation !== null) {
    res.locals.reservation = reservation;
    return next();
  }
  return next({
    status: 404,
    message: `Reservation ${reservation_id} cannot be found.`,
  });
}

function checkCapacity(req, res, next) {
  if (res.locals.reservation.people > res.locals.table.capacity) {
    return next({
      status: 400,
      message: `Table ${res.locals.table.table_id} can not seat ${res.locals.reservation.people} people, choose table with higher capacity`,
    });
  }
  return next();
}

function checkIfOccupied(req, res, next) {
  if (res.locals.table.reservation_id !== null) {
    return next({
      status: 400,
      message: `Table ${res.locals.table.table_id} is occupied, choose different table`,
    });
  }
  return next();
}

function checkIfNotOccupied(req, res, next) {
  if (res.locals.table.reservation_id === null) {
    return next({
      status: 400,
      message: `Table ${res.locals.table.table_id} is not occupied`,
    });
  }
  return next();
}

function checkIfSeated(req, res, next) {
  const { status } = res.locals.reservation;
  if (status === "seated") {
    return next({
      status: 400,
      message: "this reservation is already seated",
    });
  }
  next();
}

async function list(req, res) {
  const data = await service.list();
  return res.json({ data });
}

async function create(req, res, next) {
  const { data: { table_name, capacity, reservation_id } = {} } = req.body;

  const newTable = {
    table_name,
    capacity,
    reservation_id: reservation_id || null,
  };

  const data = await service.create(newTable);

  res.status(201).json({ data });
}

async function seatReservation(req, res, next) {
  const updatedTable = {
    ...req.body.data,
    table_id: res.locals.table.table_id,
  };

  const tableData = await service.update(updatedTable);
  res.json({ tableData });

  const updatedReservation = {
    ...res.locals.reservation,
    status: "seated",
  };

  const reservationData = await reservationsService.update(updatedReservation);
  res.json({ reservationData });
}

async function finishReservation(req, res, next) {
  const updatedTable = {
    ...res.locals.table,
    reservation_id: null,
  };

  const tableData = await service.update(updatedTable);
  res.json({ tableData });

  const updatedReservation = {
    ...res.locals.reservation,
    status: "finished",
  };

  const reservationData = await reservationsService.update(updatedReservation);
  res.json({ reservationData });
}

module.exports = {
  list: asyncErrorBoundary(list),
  create: [
    bodyDataHas("table_name"),
    bodyDataHas("capacity"),
    tableNameIsValidLength,
    capacityIsValidNumber,
    asyncErrorBoundary(create),
  ],
  seatReservation: [
    bodyDataHas("reservation_id"),
    asyncErrorBoundary(checkReservationFromBody),
    asyncErrorBoundary(tableExists),
    checkIfSeated,
    checkIfOccupied,
    checkCapacity,
    asyncErrorBoundary(seatReservation),
  ],
  finishReservation: [
    asyncErrorBoundary(tableExists),
    asyncErrorBoundary(checkReservationFromTable),
    checkIfNotOccupied,
    asyncErrorBoundary(finishReservation),
  ],
};