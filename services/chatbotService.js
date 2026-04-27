// services/chatbotService.js
const {
  ChatbotFlow,
  ChatbotStep,
  ChatbotConversation,
} = require("../models/chatbot.Model");
const Template = require("../models/template.Model");
const Contact = require("../models/contact.Model");
const {
  sendTextMessage,
  sendTemplateMessage,
} = require("../integrations/whatsapp");

// Process incoming message through chatbot
async function processChatbotMessage(contactId, message) {
  try {
    if (!contactId || !message) {
      return { processed: false, error: "Contact ID and message are required" };
    }

    const contact = await Contact.findById(contactId);
    if (!contact) {
      return { processed: false, error: "Contact not found" };
    }

    // Get active conversation or start new one
    let conversation = await ChatbotConversation.findActiveByContact(contactId);
    let flow = null;
    let currentStep = null;

    if (!conversation) {
      const matchingFlows = await ChatbotFlow.findActiveByKeyword(
        message.toLowerCase(),
      );
      flow = matchingFlows[0] || (await ChatbotFlow.findDefault());

      if (!flow) {
        await sendTextMessage(
          contact.phone,
          "Thank you for your message. Our team will get back to you shortly.",
        );
        return { processed: false, message: "No matching flow found" };
      }

      const steps = await ChatbotStep.findByFlowId(flow.id);
      const firstStep = steps[0];

      const convId = await ChatbotConversation.create(
        contactId,
        flow.id,
        firstStep?.id,
      );
      conversation = {
        id: convId,
        flow_id: flow.id,
        current_step_id: firstStep?.id,
        variables: {},
      };
      currentStep = firstStep;

      if (currentStep) {
        await executeStep(contact, currentStep, conversation, null);
      }
    } else {
      flow = await ChatbotFlow.findById(conversation.flow_id);
      const steps = await ChatbotStep.findByFlowId(flow.id);
      currentStep = steps.find((s) => s.id === conversation.current_step_id);

      if (currentStep) {
        await processUserResponse(contact, currentStep, conversation, message);
      }
    }

    return { processed: true, flow: flow?.name };
  } catch (err) {
    console.error("Error in processChatbotMessage:", err);
    return { processed: false, error: err.message };
  }
}

// Helper: Execute a step
async function executeStep(contact, step, conversation, userResponse) {
  const variables = conversation.variables
    ? JSON.parse(conversation.variables)
    : {};

  switch (step.step_type) {
    case "message":
      await sendTextMessage(contact.phone, step.message_text);
      await moveToNextStep(contact, step, conversation);
      break;

    case "question":
      await sendTextMessage(contact.phone, step.message_text);
      if (userResponse && step.save_response_as) {
        variables[step.save_response_as] = userResponse;
        await ChatbotConversation.update(conversation.id, { variables });
      }
      break;

    case "buttons":
      if (step.buttons && step.buttons.length > 0) {
        const buttonText = step.buttons
          .map((b, i) => `${i + 1}. ${b.title}`)
          .join("\n");
        await sendTextMessage(
          contact.phone,
          `${step.message_text}\n\n${buttonText}\n\nReply with the number`,
        );
      } else {
        await sendTextMessage(contact.phone, step.message_text);
      }
      await moveToNextStep(contact, step, conversation);
      break;

    case "template":
      if (step.template_id) {
        const template = await Template.findById(step.template_id);
        if (template && template.status === "APPROVED") {
          await sendTemplateMessage(
            contact.phone,
            template.name,
            template.language,
            [],
          );
        }
      }
      await moveToNextStep(contact, step, conversation);
      break;

    case "tag":
      if (step.tag_id) {
        await Contact.addTag(contact.id, step.tag_id);
      }
      await moveToNextStep(contact, step, conversation);
      break;

    case "assign":
      if (step.assign_to) {
        await Contact.update(contact.id, { assigned_to: step.assign_to });
      }
      await moveToNextStep(contact, step, conversation);
      break;

    case "stage":
      if (step.stage) {
        await Contact.update(contact.id, { stage: step.stage });
      }
      await moveToNextStep(contact, step, conversation);
      break;

    case "end":
      await ChatbotConversation.update(conversation.id, {
        status: "completed",
      });
      break;
  }

  await ChatbotConversation.addLog(
    contact.id,
    conversation.flow_id,
    step.id,
    step.step_type,
    step.message_text,
    userResponse,
    variables,
  );
}

// Helper: Move to next step
async function moveToNextStep(contact, currentStep, conversation) {
  const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
  let nextStepIndex = null;

  if (
    currentStep.next_step_index !== null &&
    currentStep.next_step_index !== undefined
  ) {
    nextStepIndex = currentStep.next_step_index;
  } else {
    const currentIndex = steps.findIndex((s) => s.id === currentStep.id);
    nextStepIndex = currentIndex + 1;
  }

  if (nextStepIndex !== null && nextStepIndex < steps.length) {
    const nextStep = steps[nextStepIndex];
    await ChatbotConversation.update(conversation.id, {
      current_step_id: nextStep.id,
    });

    if (
      nextStep.step_type !== "question" &&
      nextStep.step_type !== "condition"
    ) {
      await executeStep(contact, nextStep, conversation, null);
    }
  } else {
    await ChatbotConversation.update(conversation.id, { status: "completed" });
  }
}

// Helper: Process user response
async function processUserResponse(
  contact,
  currentStep,
  conversation,
  userResponse,
) {
  let nextStepId = null;

  // Handle button choices
  if (currentStep.step_type === "buttons" && currentStep.buttons) {
    const buttons = currentStep.buttons;
    const selectedIndex = parseInt(userResponse) - 1;

    if (!isNaN(selectedIndex) && buttons[selectedIndex]) {
      const selectedButton = buttons[selectedIndex];
      if (
        selectedButton.next_step !== undefined &&
        selectedButton.next_step !== null
      ) {
        const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
        const targetStep = steps[selectedButton.next_step];
        if (targetStep) {
          nextStepId = targetStep.id;
        }
      }
    }
  }

  // Handle conditions (keyword matching)
  if (currentStep.step_type === "condition" && currentStep.conditions) {
    const conditions = currentStep.conditions;
    for (const [keyword, stepIndex] of Object.entries(conditions)) {
      if (userResponse.toLowerCase().includes(keyword.toLowerCase())) {
        const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
        const targetStep = steps[stepIndex];
        if (targetStep) {
          nextStepId = targetStep.id;
          break;
        }
      }
    }
  }

  // Save response if question step
  if (currentStep.step_type === "question" && currentStep.save_response_as) {
    const variables = conversation.variables
      ? JSON.parse(conversation.variables)
      : {};
    variables[currentStep.save_response_as] = userResponse;
    await ChatbotConversation.update(conversation.id, { variables });
  }

  // Move to next step
  if (nextStepId) {
    await ChatbotConversation.update(conversation.id, {
      current_step_id: nextStepId,
    });
    const steps = await ChatbotStep.findByFlowId(conversation.flow_id);
    const nextStep = steps.find((s) => s.id === nextStepId);
    if (nextStep) {
      await executeStep(contact, nextStep, conversation, null);
    }
  } else {
    await moveToNextStep(contact, currentStep, conversation);
  }
}

module.exports = { processChatbotMessage };
