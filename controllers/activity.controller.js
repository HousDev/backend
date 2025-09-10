
const Activity = require('../models/Activity');

// Create and Save a new Activity
exports.create = async (req, res) => {
  try {
    // Validate request
    if (!req.body.type || !req.body.description) {
      return res.status(400).send({
        success: false,
        message: 'Activity type and description are required!'
      });
    }

    // Create an Activity
    const activity = new Activity({
      type: req.body.type,
      description: req.body.description,
      lead_id: req.body.lead_id,
      property_id: req.body.property_id,
      user_id: req.body.user_id || req.userId,
      scheduled_date: req.body.scheduled_date,
      completed_date: req.body.completed_date,
      status: req.body.status || 'pending',
      notes: req.body.notes,
      metadata: req.body.metadata || {}
    });

    // Save Activity in the database
    const data = await Activity.create(activity);
    
    res.status(201).send({
      success: true,
      message: 'Activity created successfully!',
      data: data
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Some error occurred while creating the Activity.'
    });
  }
};

// Retrieve all Activities from the database
exports.findAll = async (req, res) => {
  try {
    const filters = {
      type: req.query.type,
      status: req.query.status,
      user_id: req.query.user_id,
      lead_id: req.query.lead_id,
      property_id: req.query.property_id,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      limit: req.query.limit
    };
    
    // Remove undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined) {
        delete filters[key];
      }
    });
    
    const data = await Activity.getAll(filters);
    res.send({
      success: true,
      data: data
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Some error occurred while retrieving activities.'
    });
  }
};

// Find a single Activity with an activityId
exports.findOne = async (req, res) => {
  try {
    const data = await Activity.findById(req.params.activityId);
    if (data) {
      res.send({
        success: true,
        data: data
      });
    } else {
      res.status(404).send({
        success: false,
        message: `Activity not found with id ${req.params.activityId}.`
      });
    }
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error retrieving Activity with id ' + req.params.activityId
    });
  }
};

// Update an Activity identified by the activityId in the request
exports.update = async (req, res) => {
  try {
    // Validate Request
    if (!req.body.type || !req.body.description) {
      return res.status(400).send({
        success: false,
        message: 'Activity type and description are required!'
      });
    }

    const data = await Activity.updateById(req.params.activityId, req.body);
    
    if (data.kind === 'not_found') {
      res.status(404).send({
        success: false,
        message: `Activity not found with id ${req.params.activityId}.`
      });
    } else {
      res.send({
        success: true,
        message: 'Activity updated successfully!',
        data: data
      });
    }
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error updating Activity with id ' + req.params.activityId
    });
  }
};

// Delete an Activity with the specified activityId in the request
exports.delete = async (req, res) => {
  try {
    const data = await Activity.remove(req.params.activityId);
    
    if (data.kind === 'not_found') {
      res.status(404).send({
        success: false,
        message: `Activity not found with id ${req.params.activityId}.`
      });
    } else {
      res.send({
        success: true,
        message: 'Activity deleted successfully!'
      });
    }
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Could not delete Activity with id ' + req.params.activityId
    });
  }
};

// Get upcoming activities for a user
exports.getUpcoming = async (req, res) => {
  try {
    const userId = req.query.user_id || req.userId;
    const days = req.query.days || 7;
    
    const data = await Activity.getUpcomingActivities(userId, days);
    res.send({
      success: true,
      data: data
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error retrieving upcoming activities.'
    });
  }
};

// Get activities statistics
exports.getStats = async (req, res) => {
  try {
    const userId = req.query.user_id;
    const data = await Activity.getActivitiesStats(userId);
    res.send({
      success: true,
      data: data
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error retrieving activities statistics.'
    });
  }
};

// Mark activity as completed
exports.complete = async (req, res) => {
  try {
    // Get current activity data
    const currentActivity = await Activity.findById(req.params.activityId);
    if (!currentActivity) {
      return res.status(404).send({
        success: false,
        message: `Activity not found with id ${req.params.activityId}.`
      });
    }

    const data = await Activity.updateById(req.params.activityId, {
      ...currentActivity,
      status: 'completed',
      completed_date: new Date(),
      notes: req.body.notes || currentActivity.notes
    });
    
    if (data.kind === 'not_found') {
      res.status(404).send({
        success: false,
        message: `Activity not found with id ${req.params.activityId}.`
      });
    } else {
      res.send({
        success: true,
        message: 'Activity marked as completed!',
        data: data
      });
    }
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error completing activity with id ' + req.params.activityId
    });
  }
};

// Cancel activity
exports.cancel = async (req, res) => {
  try {
    // Get current activity data
    const currentActivity = await Activity.findById(req.params.activityId);
    if (!currentActivity) {
      return res.status(404).send({
        success: false,
        message: `Activity not found with id ${req.params.activityId}.`
      });
    }

    const data = await Activity.updateById(req.params.activityId, {
      ...currentActivity,
      status: 'cancelled',
      notes: req.body.notes || currentActivity.notes
    });
    
    if (data.kind === 'not_found') {
      res.status(404).send({
        success: false,
        message: `Activity not found with id ${req.params.activityId}.`
      });
    } else {
      res.send({
        success: true,
        message: 'Activity cancelled!',
        data: data
      });
    }
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error cancelling activity with id ' + req.params.activityId
    });
  }
};

// Get activities for today
exports.getToday = async (req, res) => {
  try {
    const userId = req.query.user_id || req.userId;
    
    const filters = {
      user_id: userId,
      date_from: new Date().toISOString().split('T')[0], // Today's date
      date_to: new Date().toISOString().split('T')[0],   // Today's date
      status: 'pending'
    };
    
    const data = await Activity.getAll(filters);
    res.send({
      success: true,
      data: data
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error retrieving today\'s activities.'
    });
  }
};